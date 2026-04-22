interface BillingAddress {
  street: string;
  city: string;
}

interface Card {
  endsWith: string;
  type: string;
}

export interface PaymentCardProps {
  billing: BillingAddress;
  cards: Card[];
}

export default function PaymentCard({ billing, cards }: PaymentCardProps) {
  return (
    <div className="card bg-base-200 shadow-md">
      <div className="card-body">
        <p className="text-xs">
          {billing.street}, {billing.city}
        </p>
        <ul className="text-xs">
          {cards.map((c) => (
            <li key={c.endsWith}>
              {c.type} ****{c.endsWith}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
