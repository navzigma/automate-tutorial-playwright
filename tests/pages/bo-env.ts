/** Back-office host for the environment named by BO_ENV (dev, stg or uat); dev when unset. */
const BO_HOSTS: Record<string, string> = {
  dev: 'https://dev-manage.nonprod-lux.com',
  stg: 'https://stg-manage.nonprod-lux.com',
  uat: 'https://manage.uatzgaming.com',
};

const env = process.env.BO_ENV ?? 'dev';
if (!BO_HOSTS[env]) throw new Error(`Unknown BO_ENV "${env}", expected one of: ${Object.keys(BO_HOSTS).join(', ')}`);

export const BO_BASE_URL = BO_HOSTS[env];
