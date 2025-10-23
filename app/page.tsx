import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-center font-mono text-sm flex flex-col gap-8">
        <h1 className="text-4xl font-bold text-center">
          Commission Tracking SaaS
        </h1>
        
        <p className="text-center text-muted-foreground max-w-2xl">
          Automatically track sales and calculate commissions from your payment processor.
          No more spreadsheets.
        </p>
        
        <div className="flex gap-4">
          <Link href="/dashboard">
            <Button size="lg">
              View Dashboard
            </Button>
          </Link>
          
          <Link href="/api/webhooks/whop" target="_blank">
            <Button size="lg" variant="outline">
              Webhook Endpoint
            </Button>
          </Link>
        </div>
        
        <div className="mt-8 p-4 border rounded-lg bg-muted/50 max-w-2xl">
          <h2 className="font-semibold mb-2">Test the webhook:</h2>
          <code className="text-xs block whitespace-pre-wrap">
{`curl -X POST http://localhost:3000/api/webhooks/whop \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "payment.succeeded",
    "data": {
      "id": "test_payment_'${Date.now()}'",
      "amount": 15000,
      "currency": "USD",
      "customer_email": "customer@example.com",
      "customer_name": "Jane Smith",
      "metadata": { "source": "paid" }
    }
  }'`}
          </code>
        </div>
      </div>
    </main>
  )
}