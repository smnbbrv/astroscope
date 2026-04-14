interface HasId {
  id: number;
  label: string;
}

interface GenericListProps<T extends HasId> {
  items: T[];
  title: string;
}

export default function GenericList<T extends HasId>(props: GenericListProps<T>) {
  return (
    <div className="card bg-base-200 shadow-md">
      <div className="card-body">
        <h3 className="card-title text-sm">{props.title}</h3>
        <pre className="bg-base-300 p-3 rounded-lg overflow-x-auto text-xs">{JSON.stringify(props, null, 2)}</pre>
      </div>
    </div>
  );
}
