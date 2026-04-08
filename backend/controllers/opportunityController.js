const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const User = require('../models/User');
const AdminLog = require('../models/AdminLog');
const { emitToUser, emitToRoom } = require('../socket');
const { createNotification } = require('./notificationController');

function normaliseText(value) {
  return (value || '').toString().trim().toLowerCase();
}

function toSkillSet(skills = []) {
  return new Set(
    (Array.isArray(skills) ? skills : [])
      .map((s) => normaliseText(s))
      .filter(Boolean)
  );
}

function buildMatchMeta(opportunity, volunteerSkillsSet, volunteerLocation) {
  const oppSkills = Array.isArray(opportunity.requiredSkills) ? opportunity.requiredSkills : [];
  const oppSkillSet = toSkillSet(oppSkills);
  const volunteerSkills = Array.from(volunteerSkillsSet);

  let skillMatches = 0;
  oppSkillSet.forEach((s) => {
    const hasMatch = volunteerSkills.some((vs) => vs === s || vs.includes(s) || s.includes(vs));
    if (hasMatch) skillMatches += 1;
  });

  const skillRatio = oppSkillSet.size ? skillMatches / oppSkillSet.size : 0;
  const locationText = normaliseText(opportunity.location);
  const locationMatch =
    Boolean(volunteerLocation) &&
    Boolean(locationText) &&
    (locationText.includes(volunteerLocation) || volunteerLocation.includes(locationText));

  const score = Math.round(skillRatio * 70 + (locationMatch ? 30 : 0));

  const reasons = [];
  if (skillMatches > 0) reasons.push(`${skillMatches} matching skill${skillMatches > 1 ? 's' : ''}`);
  if (locationMatch) reasons.push('location match');
  if (reasons.length === 0) reasons.push('recent nearby opportunity candidate');

  return {
    score,
    skillMatches,
    totalRequiredSkills: oppSkillSet.size,
    locationMatch,
    reasons,
  };
}

// ── Helper: standard error response ───────────────────────────────────────
const errorResponse = (res, status, message, details = null) => {
  const body = { error: true, message };
  if (details) body.details = details;
  return res.status(status).json(body);
};

// ── POST   Create opportunity (admin only) ────────────────────────────────
exports.createOpportunity = async (req, res) => {
  try {
    const { title, description, requiredSkills, duration, location } = req.body;

    // Validate required fields
    const errors = [];
    if (!title || !title.trim()) errors.push('Title is required');
    if (!description || !description.trim()) errors.push('Description is required');
    if (!Array.isArray(requiredSkills) || requiredSkills.length === 0)
      errors.push('At least one required skill must be provided');
    if (!duration || !duration.trim()) errors.push('Duration is required');
    if (!location || !location.trim()) errors.push('Location is required');
    if (errors.length) return errorResponse(res, 400, 'Validation failed', errors);

    // Clean skills array (trim & remove blanks)
    const cleanSkills = requiredSkills
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean);
    if (cleanSkills.length === 0)
      return errorResponse(res, 400, 'At least one non-empty skill is required');

    const opportunity = await Opportunity.create({
      title: title.trim(),
      description: description.trim(),
      requiredSkills: cleanSkills,
      duration: duration.trim(),
      location: location.trim(),
      status: 'open',
      ngo_id: req.user._id,
    });

    await AdminLog.create({
      action: 'OPPORTUNITY_CREATED',
      user_id: opportunity.ngo_id,
      performedBy: req.user._id,
      details: `Opportunity "${opportunity.title}" created by ${req.user.name}`,
    });

    // Return populated summary
    const populated = await Opportunity.findById(opportunity._id)
      .populate('ngo_id', 'name email username')
      .lean();

    // ── Real-time: broadcast new opportunity to volunteers ──
    try {
      emitToRoom('role:volunteer', 'opportunity:created', populated);

      const volunteers = await User.find({
        role: 'volunteer',
        isSuspended: { $ne: true },
      }).select('_id name skills location').lean();

      const oppLocation = normaliseText(opportunity.location);
      const oppSkillsSet = toSkillSet(opportunity.requiredSkills);

      await Promise.all(
        volunteers.map(async (vol) => {
          const vSkillsSet = toSkillSet(vol.skills || []);
          let sharedSkills = 0;
          oppSkillsSet.forEach((s) => {
            if (vSkillsSet.has(s)) sharedSkills += 1;
          });

          const vLocation = normaliseText(vol.location);
          const locationMatch =
            Boolean(vLocation) &&
            Boolean(oppLocation) &&
            (oppLocation.includes(vLocation) || vLocation.includes(oppLocation));

          const isProfileMatch = sharedSkills > 0 || locationMatch;

          await createNotification({
            user_id: vol._id,
            type: 'opportunity:created',
            title: 'New Opportunity Posted',
            message: `A new opportunity "${opportunity.title}" is now available`,
            ref_id: opportunity._id,
            ref_model: 'Opportunity',
          });

          if (isProfileMatch) {
            await createNotification({
              user_id: vol._id,
              type: 'opportunity:match',
              title: 'New Opportunity Matches Your Profile',
              message: `"${opportunity.title}" matches your skills/location`,
              ref_id: opportunity._id,
              ref_model: 'Opportunity',
            });

            emitToUser(vol._id, 'opportunity:match', {
              opportunityId: opportunity._id,
              title: opportunity.title,
            });
          }
        })
      );
    } catch (e) { console.error('Socket emit error:', e.message); }

    res.status(201).json(populated);
  } catch (error) {
    console.error('createOpportunity error:', error);
    return errorResponse(res, 500, error.message || 'Server error');
  }
};

// ── GET    Match suggestions for volunteer ───────────────────────────────
exports.listMatchedOpportunities = async (req, res) => {
  try {
    if (req.user.role !== 'volunteer') {
      return errorResponse(res, 403, 'Only volunteers can access match suggestions');
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(30, Math.max(1, parseInt(req.query.limit) || 8));

    const volunteer = await User.findById(req.user._id)
      .select('skills location isSuspended')
      .lean();
    if (!volunteer || volunteer.isSuspended) {
      return errorResponse(res, 403, 'Volunteer account is not active');
    }

    const volunteerSkillsSet = toSkillSet(volunteer.skills || []);
    const volunteerLocation = normaliseText(volunteer.location);

    const [openOpps, myApps] = await Promise.all([
      Opportunity.find({ status: 'open', isDeleted: false })
        .populate('ngo_id', 'name email username')
        .sort({ createdAt: -1 })
        .lean(),
      Application.find({ volunteer_id: req.user._id })
        .select('opportunity_id')
        .lean(),
    ]);

    const appliedOppIds = new Set(myApps.map((a) => a.opportunity_id?.toString()).filter(Boolean));

    const scored = openOpps
      .filter((opp) => !appliedOppIds.has(opp._id.toString()))
      .map((opp) => {
        const match = buildMatchMeta(opp, volunteerSkillsSet, volunteerLocation);
        return {
          ...opp,
          matchScore: match.score,
          matchMeta: {
            skillMatches: match.skillMatches,
            totalRequiredSkills: match.totalRequiredSkills,
            locationMatch: match.locationMatch,
            reasons: match.reasons,
          },
        };
      })
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    const total = scored.length;
    const start = (page - 1) * limit;
    const opportunities = scored.slice(start, start + limit);

    res.json({
      opportunities,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      profile: {
        skillsCount: volunteerSkillsSet.size,
        location: volunteer.location || '',
      },
    });
  } catch (error) {
    console.error('listMatchedOpportunities error:', error);
    return errorResponse(res, 500, error.message || 'Server error');
  }
};

// ── GET    List opportunities ─────────────────────────────────────────────
exports.listOpportunities = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 12));
    const skip = (page - 1) * limit;

    // Build filter
    const filter = { isDeleted: false };

    // Volunteers see only open; admins see all statuses for their own opps
    if (req.user.role === 'volunteer' || req.user.role === 'user') {
      filter.status = 'open';
    } else if (req.user.role === 'admin') {
      // Optional: admin can filter by own opps with ?mine=true
      if (req.query.mine === 'true') {
        filter.ngo_id = req.user._id;
      }
      // Admin can include deleted if ?includeDeleted=true
      if (req.query.includeDeleted === 'true') {
        delete filter.isDeleted;
      }
      // Admin can filter by status
      if (req.query.status && ['open', 'in-progress', 'closed'].includes(req.query.status)) {
        filter.status = req.query.status;
      }
    }

    // Location filter
    if (req.query.location) {
      filter.location = { $regex: req.query.location, $options: 'i' };
    }

    // Skills filter — match any of the requested skills
    if (req.query.skills) {
      const skillsArr = req.query.skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (skillsArr.length) {
        filter.requiredSkills = { $in: skillsArr };
      }
    }

    const [opportunities, total] = await Promise.all([
      Opportunity.find(filter)
        .populate('ngo_id', 'name email username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Opportunity.countDocuments(filter),
    ]);

    res.json({
      opportunities,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('listOpportunities error:', error);
    return errorResponse(res, 500, error.message || 'Server error');
  }
};

// ── GET    Single opportunity ─────────────────────────────────────────────
exports.getOpportunity = async (req, res) => {
  try {
    const opp = await Opportunity.findById(req.params.id)
      .populate('ngo_id', 'name email username')
      .lean();

    if (!opp) return errorResponse(res, 404, 'Opportunity not found');

    // Volunteers should not see deleted opps
    if (opp.isDeleted && req.user.role !== 'admin') {
      return errorResponse(res, 404, 'Opportunity not found');
    }

    res.json(opp);
  } catch (error) {
    if (error.name === 'CastError')
      return errorResponse(res, 400, 'Invalid opportunity ID');
    return errorResponse(res, 500, error.message || 'Server error');
  }
};

// ── PUT    Update opportunity (admin) ───────────────────────────────────────
exports.updateOpportunity = async (req, res) => {
  try {
    const opp = await Opportunity.findById(req.params.id);
    if (!opp) return errorResponse(res, 404, 'Opportunity not found');
    if (opp.isDeleted) return errorResponse(res, 404, 'Opportunity not found');

    // Disallow changing ngo_id
    if (req.body.ngo_id && req.body.ngo_id !== opp.ngo_id.toString()) {
      return errorResponse(res, 400, 'Cannot change the creator reference');
    }

    // Validate editable fields
    const { title, description, requiredSkills, duration, location, status } = req.body;
    const errors = [];
    if (title !== undefined && (!title || !title.trim())) errors.push('Title cannot be empty');
    if (description !== undefined && (!description || !description.trim()))
      errors.push('Description cannot be empty');
    if (requiredSkills !== undefined) {
      if (!Array.isArray(requiredSkills) || requiredSkills.length === 0)
        errors.push('At least one skill is required');
    }
    if (duration !== undefined && (!duration || !duration.trim()))
      errors.push('Duration cannot be empty');
    if (location !== undefined && (!location || !location.trim()))
      errors.push('Location cannot be empty');
    if (status !== undefined && !['open', 'in-progress', 'closed'].includes(status))
      errors.push('Status must be open, in-progress, or closed');
    if (errors.length) return errorResponse(res, 400, 'Validation failed', errors);

    // Apply updates
    const updateFields = {};
    if (title) updateFields.title = title.trim();
    if (description) updateFields.description = description.trim();
    if (requiredSkills) {
      updateFields.requiredSkills = requiredSkills
        .map((s) => (typeof s === 'string' ? s.trim() : ''))
        .filter(Boolean);
    }
    if (duration) updateFields.duration = duration.trim();
    if (location) updateFields.location = location.trim();
    if (status) updateFields.status = status;

    const updated = await Opportunity.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    )
      .populate('ngo_id', 'name email username')
      .lean();

    await AdminLog.create({
      action: 'OPPORTUNITY_UPDATED',
      user_id: opp.ngo_id,
      performedBy: req.user._id,
      details: `Opportunity "${updated.title}" updated by ${req.user.name}`,
    });

    // ── Real-time: notify applicants of update ──
    try {
      emitToRoom(`opportunity:${updated._id}`, 'opportunity:updated', updated);
      emitToRoom('role:volunteer', 'opportunity:updated', updated);

      const applicants = await Application.find({ opportunity_id: updated._id })
        .select('volunteer_id').lean();
      for (const app of applicants) {
        await createNotification({
          user_id: app.volunteer_id,
          type: 'opportunity:updated',
          title: 'Opportunity Updated',
          message: `"${updated.title}" has been updated`,
          ref_id: updated._id,
          ref_model: 'Opportunity',
        });
      }
    } catch (e) { console.error('Socket/notif emit error:', e.message); }

    res.json(updated);
  } catch (error) {
    if (error.name === 'CastError')
      return errorResponse(res, 400, 'Invalid opportunity ID');
    return errorResponse(res, 500, error.message || 'Server error');
  }
};

// ── DELETE  Soft-delete opportunity (admin) ─────────────────────────────────
exports.deleteOpportunity = async (req, res) => {
  try {
    const opp = await Opportunity.findById(req.params.id);
    if (!opp) return errorResponse(res, 404, 'Opportunity not found');
    if (opp.isDeleted) return errorResponse(res, 404, 'Opportunity already deleted');

    opp.isDeleted = true;
    await opp.save();

    await AdminLog.create({
      action: 'OPPORTUNITY_DELETED',
      user_id: opp.ngo_id,
      performedBy: req.user._id,
      details: `Opportunity "${opp.title}" soft-deleted by ${req.user.name}`,
    });

    // ── Real-time: notify applicants of deletion ──
    try {
      emitToRoom(`opportunity:${opp._id}`, 'opportunity:deleted', { _id: opp._id });
      emitToRoom('role:volunteer', 'opportunity:deleted', { _id: opp._id });

      const applicants = await Application.find({ opportunity_id: opp._id })
        .select('volunteer_id').lean();
      for (const app of applicants) {
        await createNotification({
          user_id: app.volunteer_id,
          type: 'opportunity:deleted',
          title: 'Opportunity Removed',
          message: `"${opp.title}" is no longer available`,
          ref_id: opp._id,
          ref_model: 'Opportunity',
        });
      }
    } catch (e) { console.error('Socket/notif emit error:', e.message); }

    res.json({ message: 'Opportunity deleted successfully' });
  } catch (error) {
    if (error.name === 'CastError')
      return errorResponse(res, 400, 'Invalid opportunity ID');
    return errorResponse(res, 500, error.message || 'Server error');
  }
};
