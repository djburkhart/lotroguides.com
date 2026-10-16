import type { Core } from '@strapi/strapi';
import { seedContent } from './seed';

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    try {
      await seedContent(strapi as unknown as Parameters<typeof seedContent>[0]);
    } catch (error) {
      strapi.log.error(`Content seed failed: ${(error as Error).message}`);
    }
  },
};
