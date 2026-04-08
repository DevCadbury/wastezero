jest.mock('../models/Pickup', () => ({
  findOne: jest.fn(),
}));

const Pickup = require('../models/Pickup');
const messagesRoute = require('../routes/messages');

function queryChain(result) {
  return {
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

describe('messages conversation lock precedence', () => {
  beforeEach(() => {
    Pickup.findOne.mockReset();
  });

  test('prefers active accepted pickup over old completed lock', async () => {
    const accepted = {
      _id: 'accepted-1',
      status: 'Accepted',
      completedAt: null,
    };

    Pickup.findOne.mockImplementationOnce(() => queryChain(accepted));

    const lock = await messagesRoute.__test.getConversationLock('user-1', 'vol-1');

    expect(lock.locked).toBe(false);
    expect(String(lock.pickup_id)).toBe(String(accepted._id));
    expect(lock.status).toBe('Accepted');
    expect(lock.lockReason).toBeNull();
    expect(Pickup.findOne).toHaveBeenCalledTimes(1);
  });

  test('locks when latest matched pickup is completed beyond 24h window', async () => {
    const oldCompleted = {
      _id: 'completed-1',
      status: 'Completed',
      completedAt: new Date(Date.now() - (25 * 60 * 60 * 1000)),
    };

    Pickup.findOne
      .mockImplementationOnce(() => queryChain(null))
      .mockImplementationOnce(() => queryChain(oldCompleted));

    const lock = await messagesRoute.__test.getConversationLock('user-1', 'vol-1');

    expect(lock.locked).toBe(true);
    expect(String(lock.pickup_id)).toBe(String(oldCompleted._id));
    expect(lock.status).toBe('Completed');
    expect(lock.lockReason).toMatch(/archived/i);
    expect(lock.lockAt).toBeTruthy();
  });
});
