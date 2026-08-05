import { NextRequest, NextResponse } from 'next/server';
import { getReviewQueue, classifyVendor, CATEGORIES } from '@/lib/sheets';
import { isAuthenticated } from '@/lib/auth';

export async function GET() {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const vendors = await getReviewQueue();
    return NextResponse.json({ vendors, categories: CATEGORIES });
  } catch (err) {
    console.error('Review queue error:', err);
    return NextResponse.json({ error: 'Failed to load review queue' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { vendorKey, category } = await request.json();
    if (!vendorKey || !category) {
      return NextResponse.json({ error: 'vendorKey and category are required' }, { status: 400 });
    }
    if (!CATEGORIES.includes(category)) {
      return NextResponse.json({ error: `Unknown category: ${category}` }, { status: 400 });
    }

    const result = await classifyVendor(vendorKey, category);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('Classify error:', err);
    return NextResponse.json({ error: 'Failed to classify vendor' }, { status: 500 });
  }
}
