import { gql, useQuery } from "@apollo/client";

const query = gql`
  query ProductsQuery {
    products {
      id
      name
    }
  }
`;

export default function Products() {
  const { data, loading } = useQuery(query);
  if (loading || !data) return null;
  return (
    <>
      <ul>
        {data.products.map((product: { id: string; name: string }) => (
          <li key={product.id}>{product.name}</li>
        ))}
      </ul>
    </>
  );
}