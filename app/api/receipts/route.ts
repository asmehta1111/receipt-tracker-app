import { NextRequest, NextResponse } from 'next/server';
import { getAllReceipts, addReceipt, bulkUpdateCategory, deleteReceipts, renameVendor, updateDescription } from '@/lib/sheets';
import { isAuthenticated } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await isAuthenticated();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const receipts = await getAllReceipts();
    return NextResponse.json(receipts);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch receipts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await isAuthenticated();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, data } = body;

    if (action === 'add') {
      await addReceipt(data);
      return NextResponse.json({ success: true });
    }

    if (action === 'bulkUpdateCategory') {
      const { rowIndices, category } = data;
      await bulkUpdateCategory(rowIndices, category);
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      const { rowIndices } = data;
      await deleteReceipts(rowIndices);
      return NextResponse.json({ success: true });
    }

    if (action === 'renameVendor') {
      const { oldName, newName } = data;
      await renameVendor(oldName, newName);
      return NextResponse.json({ success: true });
    }

    if (action === 'updateDescription') {
      const { rowIndex, description } = data;
      await updateDescription(rowIndex, description);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json(
      { error: 'Operation failed' },
      { status: 500 }
    );
  }
}
