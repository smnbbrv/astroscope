interface DirectDebit {
  iban: string;
}

interface CreditCard {
  endsWith: string;
  type: string;
}

interface PaymentInfoProps {
  directDebit: DirectDebit;
  creditCards: CreditCard[];
}

export default function PaymentInfo(props: PaymentInfoProps) {
  return (
    <div className="card bg-base-200 shadow-md">
      <div className="card-body">
        <h3 className="card-title text-sm">Client-Side Rendered</h3>
        <pre className="bg-base-300 p-3 rounded-lg overflow-x-auto text-xs">{JSON.stringify(props, null, 2)}</pre>
      </div>
    </div>
  );
}
