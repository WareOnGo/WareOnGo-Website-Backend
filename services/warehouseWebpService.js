import { createEnricherWebpJob } from './enricherWebpJob.js';

export const webpConfigured = () => Boolean(process.env.R2_SECRET_ACCESS_KEY?.trim());

export const warehouseWebpJob = createEnricherWebpJob();
