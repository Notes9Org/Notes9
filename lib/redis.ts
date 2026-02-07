
import Redis from 'ioredis';

const getRedisUrl = () => {
    if (process.env.REDIS_URL) {
        return process.env.REDIS_URL;
    }
    return null;
};

// Create a client only if URL exists, otherwise handle it gracefully
const redisUrl = getRedisUrl();
export const redis = redisUrl ? new Redis(redisUrl) : null;

// Sliding window configuration
const MAX_RECENT_MESSAGES = 10;
const SESSION_EXPIRY_SECONDS = 60 * 60 * 24; // 24 hours

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

/**
 * Fetch recent chat messages from Redis
 */
export async function getRecentChatContext(sessionId: string): Promise<ChatMessage[] | null> {
    if (!redis) return null;

    try {
        const raw = await redis.get(`session:${sessionId}:recent_messages`);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (error) {
        console.warn('Redis get error:', error);
        return null;
    }
}

/**
 * Update the sliding window of messages in Redis
 */
export async function updateChatContext(sessionId: string, newMessages: ChatMessage[]) {
    if (!redis) return;

    try {
        const key = `session:${sessionId}:recent_messages`;

        const currentStr = await redis.get(key);
        let current: ChatMessage[] = currentStr ? JSON.parse(currentStr) : [];

        const updated = [...current, ...newMessages].slice(-MAX_RECENT_MESSAGES);

        await redis.setex(key, SESSION_EXPIRY_SECONDS, JSON.stringify(updated));
    } catch (error) {
        console.warn('Redis update error:', error);
    }
}
