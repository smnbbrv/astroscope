interface UserCardProps {
  name: string;
  email: string;
}

export default function UserCard({ name, email }: UserCardProps) {
  return (
    <div className="card bg-base-200 shadow-md">
      <div className="card-body">
        <h3 className="card-title text-sm">{name}</h3>
        <p className="text-xs">{email}</p>
      </div>
    </div>
  );
}
