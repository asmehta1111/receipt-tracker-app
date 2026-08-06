import { NextRequest, NextResponse } from 'next/server';
import { getDuplicateGroups, mergeDuplicates } from '@/lib/sheets';
import { isAuthenticated } from '@/lib/auth';

export async function GET() {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const groups = await getDuplicateGroups();
    return NextResponse.json({
      groups,
      totalGroups: groups.length,
      totalWasted: Math.round(groups.reduce((s, g) => s + g.wastedUsd, 0) * 100) / 100,
    });
  } catch (err) {
    console.error('Duplicates error:', err);
    return NextResponse.json({ error: 'Failed to find duplicates' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { rowIndices } = await request.json();
    if (!Array.isArray(rowIndices) || rowIndices.length === 0) {
      return NextResponse.json({ error: 'rowIndices required' }, { status: 400 });
    }
    const result = await mergeDuplicates(rowIndices);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('Merge error:', err);
    return NextResponse.json({ error: 'Failed to merge' }, { status: 500 });
  }
}
