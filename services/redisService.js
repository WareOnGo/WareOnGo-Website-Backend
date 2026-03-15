import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    if (this.client && this.isConnected) {
      return this.client;
    }

    this.client = createClient({
      username: process.env.REDIS_USERNAME || 'default',
      password: process.env.REDIS_PASSWORD,
      socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT) || 6379
      }
    });

    this.client.on('error', err => console.log('Redis Client Error', err));
    this.client.on('connect', () => {
      console.log('Connected to Redis');
      this.isConnected = true;
    });
    this.client.on('disconnect', () => {
      this.isConnected = false;
    });

    await this.client.connect();
    return this.client;
  }

  async get(key) {
    if (!this.client || !this.isConnected) {
      await this.connect();
    }
    return await this.client.get(key);
  }

  async setEx(key, ttl, value) {
    if (!this.client || !this.isConnected) {
      await this.connect();
    }
    return await this.client.setEx(key, ttl, value);
  }

  async del(keys) {
    if (!this.client || !this.isConnected) {
      await this.connect();
    }
    return await this.client.del(keys);
  }

  async ping() {
    if (!this.client || !this.isConnected) {
      await this.connect();
    }
    return await this.client.ping();
  }

  scanIterator(options) {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client not connected');
    }
    return this.client.scanIterator(options);
  }

  async quit() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
    }
  }
}

export default new RedisService();