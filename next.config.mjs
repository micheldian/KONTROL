import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Embarque les polices du PDF dans la fonction serverless (Vercel)
    outputFileTracingIncludes: {
      '/api/clotures/[id]/pdf': ['./public/fonts/**']
    }
  }
};

export default withNextIntl(nextConfig);
