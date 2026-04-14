interface Item {
  id: number;
  title: string;
}

interface ItemListProps {
  items: Item[];
  heading: string;
}

export default function ItemList(props: ItemListProps) {
  return (
    <div className="card bg-base-200 shadow-md">
      <div className="card-body">
        <h3 className="card-title text-sm">{props.heading}</h3>
        <pre className="bg-base-300 p-3 rounded-lg overflow-x-auto text-xs">{JSON.stringify(props, null, 2)}</pre>
      </div>
    </div>
  );
}
