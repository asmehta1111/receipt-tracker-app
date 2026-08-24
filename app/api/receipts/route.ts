import { NextRequest, NextResponse } from 'next/server';
import { getAllReceipts, addReceipt, bulkUpdateCategory, deleteReceipts, renameVendor, updateDescription, setStatus, setPerson, VOID_STATUSES, PEOPLE } from '@/lib/sheets';
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
      // Status and Person are exclusion axes, so a typo here silently changes
      // the headline spend number. Reject unknown values rather than write them.
      if (data?.status && !VOID_STATUSES.includes(data.status)) {
        return NextResponse.json({ error: `Unknown status: ${data.status}` }, { status: 400 });
      }
      if (data?.person && !PEOPLE.includes(data.person)) {
        return NextResponse.json({ error: `Unknown person: ${data.person}` }, { status: 400 });
      }
      await addReceipt(data);
      return NextResponse.json({ success: true });
    }

    if (action === 'bulkUpdateCategory') {
      const { rowIndices, category } = data;
      await bulkUpdateCategory(rowIndices, category);
      return NextResponse.json({ success: true });
    }

    if (action === 'setStatus') {
      const { rowIndices, status } = data;
      if (status && !VOID_STATUSES.includes(status)) {
        return NextResponse.json({ error: `Unknown status: ${status}` }, { status: 400 });
      }
      const result = await setStatus(rowIndices, status || '');
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'setPerson') {
      const { rowIndices, person } = data;
      if (person && !PEOPLE.includes(person)) {
        return NextResponse.json({ error: `Unknown person: ${person}` }, { status: 400 });
      }
      const result = await setPerson(rowIndices, person || '');
      return NextResponse.json({ success: true, ...result });
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
