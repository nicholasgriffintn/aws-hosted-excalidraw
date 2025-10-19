export interface FrontendConfig {
  assetBucket: string;
  teamId: string;
  region: string;
}

const assetBucket = import.meta.env.VITE_EXCALIDRAW_ASSET_BUCKET as string | undefined;
const teamId = (import.meta.env.VITE_EXCALIDRAW_TEAM_ID as string | undefined) ?? 'default';
const region = (import.meta.env.VITE_AWS_REGION as string | undefined) ?? 'eu-west-1';

if (!assetBucket) {
  throw new Error('VITE_EXCALIDRAW_ASSET_BUCKET is not configured');
}

export const config: FrontendConfig = {
  assetBucket,
  teamId,
  region,
};
