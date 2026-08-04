import { NextRequest, NextResponse } from 'next/server';
import { getAllReceipts, isExpense } from '@/lib/sheets';
import { isAuthenticated } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await isAuthenticated();
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const all = await getAllReceipts();

    // Investment capital flows stay in the Sheet but never count as spend.
    const receipts = all.filter(isExpense);
    const excluded = all.filter(r => !isExpense(r));

    // Total spend
    const totalSpend = receipts.reduce((sum, r) => sum + (r.usdEstimate || 0), 0);

    // By category
    const byCategory: any = {};
    receipts.forEach(r => {
      if (!byCategory[r.category]) {
        byCategory[r.category] = { total: 0, count: 0 };
      }
      byCategory[r.category].total += r.usdEstimate || 0;
      byCategory[r.category].count += 1;
    });

    // By account
    const byAccount: any = {};
    receipts.forEach(r => {
      if (!byAccount[r.emailAccount]) {
        byAccount[r.emailAccount] = { total: 0, count: 0 };
      }
      byAccount[r.emailAccount].total += r.usdEstimate || 0;
      byAccount[r.emailAccount].count += 1;
    });

    // Monthly trend
    const byMonth: any = {};
    receipts.forEach(r => {
      if (r.month && !byMonth[r.month]) {
        byMonth[r.month] = 0;
      }
      if (r.month) byMonth[r.month] += r.usdEstimate || 0;
    });

    // Active subscriptions
    const subscriptions = receipts
      .filter(r => r.isSubscription === 'Yes')
      .sort((a, b) => new Date(b.renewalDate).getTime() - new Date(a.renewalDate).getTime());

    return NextResponse.json({
      totalSpend: Math.round(totalSpend * 100) / 100,
      transactionCount: receipts.length,
      subscriptionCount: subscriptions.length,
      byCategory: Object.entries(byCategory).map(([name, data]: any) => ({
        name,
        value: Math.round(data.total * 100) / 100,
        count: data.count,
      })),
      byAccount: Object.entries(byAccount).map(([name, data]: any) => ({
        name: name.split('@')[0],
        value: Math.round(data.total * 100) / 100,
        count: data.count,
      })),
      monthlyTrend: Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, value]) => ({
          month,
          value: Math.round((value as number) * 100) / 100,
        })),
      subscriptions: subscriptions.slice(0, 10),
      excludedInvestments: {
        count: excluded.length,
        total: Math.round(excluded.reduce((s, r) => s + (r.usdEstimate || 0), 0) * 100) / 100,
      },
    });
  } catch (err) {
    console.error('Analytics error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
