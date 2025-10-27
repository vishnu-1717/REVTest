import { withPrisma } from '@/lib/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

async function getDashboardData() {
  try {
    // Use withPrisma to avoid prepared statement conflicts
    const data = await withPrisma(async (prisma) => {
      // Use regular Prisma queries to avoid prepared statement issues
      const sales = await prisma.sale.findMany({
        include: {
          User: {
            select: {
              name: true,
            },
          },
          Commission: {
            select: {
              amount: true,
              status: true,
            },
          },
        },
        orderBy: {
          paidAt: 'desc',
        },
      })
      
      // Calculate totals
      const totalSales = sales.reduce((sum: number, sale: any) => {
        return sum + Number(sale.amount || 0)
      }, 0)
      
      const totalCommissions = sales.reduce((sum: number, sale: any) => {
        return sum + (sale.Commission?.amount ? Number(sale.Commission.amount) : 0)
      }, 0)
      
      const pendingCommissions = sales
        .filter((sale: any) => sale.Commission?.status === 'pending')
        .reduce((sum: number, sale: any) => {
          return sum + (sale.Commission?.amount ? Number(sale.Commission.amount) : 0)
        }, 0)
      
      return {
        sales,
        totalSales,
        totalCommissions,
        pendingCommissions,
        salesCount: sales.length,
      }
    })
    
    return data
  } catch (error) {
    console.error('Dashboard data error:', error)
    // Return empty data if database query fails
    return {
      sales: [],
      totalSales: 0,
      totalCommissions: 0,
      pendingCommissions: 0,
      salesCount: 0,
    }
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()
  
  return (
    <div className="container mx-auto py-10">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sales Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your sales and commissions
          </p>
        </div>
        
        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Sales
              </CardTitle>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                className="h-4 w-4 text-muted-foreground"
              >
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${data.totalSales.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                {data.salesCount} transactions
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Commissions
              </CardTitle>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                className="h-4 w-4 text-muted-foreground"
              >
                <rect width="20" height="14" x="2" y="5" rx="2" />
                <path d="M2 10h20" />
              </svg>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${data.totalCommissions.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                All time
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Pending Commissions
              </CardTitle>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                className="h-4 w-4 text-muted-foreground"
              >
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${data.pendingCommissions.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                To be paid out
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Avg Deal Size
              </CardTitle>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                className="h-4 w-4 text-muted-foreground"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${data.salesCount > 0 ? (data.totalSales / data.salesCount).toFixed(2) : '0.00'}
              </div>
              <p className="text-xs text-muted-foreground">
                Per transaction
              </p>
            </CardContent>
          </Card>
        </div>
        
        {/* Recent Sales Table */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
            <CardDescription>
              All transactions and their commission status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Rep</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No sales yet. Test the webhook to add data!
                    </TableCell>
                  </TableRow>
                ) : (
                  data.sales.map((sale: any) => (
                    <TableRow key={sale.id}>
                      <TableCell>
                        {sale.paidAt ? new Date(sale.paidAt).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{sale.customerName || 'Unknown'}</div>
                        <div className="text-sm text-muted-foreground">
                          {sale.customerEmail || 'No email'}
                        </div>
                      </TableCell>
                      <TableCell>{sale.User?.name || 'Unassigned'}</TableCell>
                      <TableCell className="font-medium">
                        ${Number(sale.amount).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {sale.Commission?.amount ? (
                          <span className="text-sm">
                            ${Number(sale.Commission.amount).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            sale.status === 'paid' ? 'default' :
                            sale.status === 'refunded' ? 'destructive' :
                            'secondary'
                          }
                        >
                          {sale.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
