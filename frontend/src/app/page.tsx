import { BillingForm } from "@/components/billing-form";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium tracking-tight">Utility Bill</p>
            <p className="text-xs text-muted-foreground">Property billing generator</p>
          </div>
          <Badge variant="secondary">No persistence</Badge>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-10">
        <div className="mb-6 space-y-2">
          <h1 className="font-heading text-2xl tracking-tight">
            Upload property inputs, download this month’s billing workbook
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Use the files in each property folder (Occupant Count, Rent Roll, SAWS
            PDFs, and last month’s billing workbook). Do not upload anything from
            Import or Utility Billing August — those are outputs. The API returns
            an August-style workbook plus a ResMan CSV, in memory only.
          </p>
        </div>
        <BillingForm />
      </main>
    </div>
  );
}
