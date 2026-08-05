import { NextRequest, NextResponse } from 'next/server';
import { getAllReceipts, isExpense, NON_EXPENSE_CATEGORIES } from '@/lib/sheets';
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

    // By vendor — the fastest way to see what a category is actually made of
    const byVendor: any = {};
    receipts.forEach(r => {
      const v = r.vendor || '(no vendor)';
      if (!byVendor[v]) byVendor[v] = { total: 0, count: 0, category: r.category };
      byVendor[v].total += r.usdEstimate || 0;
      byVendor[v].count += 1;
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
      byVendor: Object.entries(byVendor)
        .map(([name, d]: any) => ({
          name,
          value: Math.round(d.total * 100) / 100,
          count: d.count,
          category: d.category,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 40),
      monthlyTrend: Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, value]) => ({
          month,
          value: Math.round((value as number) * 100) / 100,
        })),
      subscriptions: subscriptions.slice(0, 10),
      nonExpenseCategories: NON_EXPENSE_CATEGORIES,
      excluded: {
        count: excluded.length,
        total: Math.round(excluded.reduce((s, r) => s + (r.usdEstimate || 0), 0) * 100) / 100,
        byCategory: Object.entries(
          excluded.reduce((acc: any, r) => {
            const c = r.category || 'Other';
            if (!acc[c]) acc[c] = { count: 0, total: 0 };
            acc[c].count += 1;
            acc[c].total += r.usdEstimate || 0;
            return acc;
          }, {})
        )
          .map(([name, d]: any) => ({ name, count: d.count, total: Math.round(d.total * 100) / 100 }))
          .sort((a, b) => b.total - a.total),
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
