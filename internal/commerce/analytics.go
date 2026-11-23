package commerce

import (
	"context"
	"time"
)

type AnalyticsCounts struct {
	Orders, Landings, Purchases, GrossPaise int64
}

func (c *AnalyticsCounts) Add(other AnalyticsCounts) {
	c.Orders += other.Orders
	c.Landings += other.Landings
	c.Purchases += other.Purchases
	c.GrossPaise += other.GrossPaise
}

type AnalyticsRow struct {
	Day, Product string
	AnalyticsCounts
}

// Analytics reports live commerce activity on each event's own date in India.
func (s *Shop) Analytics(ctx context.Context, start, end time.Time) ([]AnalyticsRow, error) {
	rows, err := s.db.QueryContext(ctx, `
		WITH events AS (
			SELECT created_at AS at, product, bundle_product, 1 AS orders, 0 AS landings, 0 AS purchases, 0 AS gross
			FROM excel_orders WHERE mode='live' AND created_at >= $1 AND created_at < $2
			UNION ALL
			SELECT checkout_landed_at, product, bundle_product, 0, 1, 0, 0
			FROM excel_orders WHERE mode='live' AND checkout_landed_at >= $1 AND checkout_landed_at < $2
			UNION ALL
			SELECT paid_at, product, bundle_product, 0, 0, 1, amount_paise
			FROM excel_orders WHERE mode='live' AND paid_at >= $1 AND paid_at < $2
		)
		SELECT to_char(at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD'), product, COALESCE(bundle_product, ''),
			SUM(orders), SUM(landings), SUM(purchases), SUM(gross)
		FROM events GROUP BY 1, 2, 3`, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []AnalyticsRow
	for rows.Next() {
		var row AnalyticsRow
		var id, bundle string
		if err := rows.Scan(&row.Day, &id, &bundle, &row.Orders, &row.Landings, &row.Purchases, &row.GrossPaise); err != nil {
			return nil, err
		}
		row.Product = analyticsProductName(id)
		if bundle != "" {
			row.Product += " + " + analyticsProductName(bundle)
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

func analyticsProductName(id string) string {
	if item, ok := catalog[id]; ok {
		return item.Name
	}
	if id == product {
		return "Excel Kit (legacy)"
	}
	return id
}
