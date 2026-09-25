import Storefront from '@/components/Storefront';
import { getPublicCatalog } from '@/lib/public-catalog';

export const revalidate = 60;

export default async function HomePage() {
  let catalog = null;
  try {
    catalog = await getPublicCatalog();
  } catch (error) {
    const expectedLocalSetup = error instanceof Error && error.message.includes('NOT_CONFIGURED');
    if (!expectedLocalSetup) console.error('DROPKE storefront catalog shell failed', error);
  }

  return <Storefront initialCatalog={catalog} />;
}
