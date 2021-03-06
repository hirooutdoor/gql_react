# Chapter 3. コロケーション

## ToC

- [はじめに](#%E3%81%AF%E3%81%98%E3%82%81%E3%81%AB)
- [コンポーネントの分割](#%E3%82%B3%E3%83%B3%E3%83%9D%E3%83%BC%E3%83%8D%E3%83%B3%E3%83%88%E3%81%AE%E5%88%86%E5%89%B2)
  - [問題点](#%E5%95%8F%E9%A1%8C%E7%82%B9)
- [細部のことは細部に任せる](#%E7%B4%B0%E9%83%A8%E3%81%AE%E3%81%93%E3%81%A8%E3%81%AF%E7%B4%B0%E9%83%A8%E3%81%AB%E4%BB%BB%E3%81%9B%E3%82%8B)
- [GraphQL クエリの分割と Fragment](#graphql-%E3%82%AF%E3%82%A8%E3%83%AA%E3%81%AE%E5%88%86%E5%89%B2%E3%81%A8-fragment)
- [Fragment Colocation の導入](#fragment-colocation-%E3%81%AE%E5%B0%8E%E5%85%A5)
- [Separation of Concern](#separation-of-concern)

## はじめに

"Colocation" という言葉を聞いたことがあるでしょうか？

"Colocate" は co(一緒に) locate(配置する) という意味です。本章では「UI Component と GraphQL Query を一緒に配置する」という手法について学びます。

## コンポーネントの分割

さて、Chapter 2. で作成した `ProductDetail` Component は少し大きくなってきました。このタイミングで Component を分割することを検討してみましょう。

```
src
├── App.tsx
├── components
│   ├── ProductDetail.tsx
│   ├── ProductReview.tsx   <--- これを ProductDetail.tsx から分離
│   ├── Products.tsx
└── index.tsx
```

ここでは商品のレビュー一覧と投稿フォーム部分（JSX における以下の部分）を `ProductReview` Component に切り出してみたいと思います。

```tsx
return (
  <>
    {product.reviews.length ? (
      <ul>
        {product.reviews.map(r => (
          <li key={r.id}>{r.commentBody}</li>
        ))}
      </ul>
    ) : (
      <p>レビューはまだありません</p>
    )}
    <form
      onSubmit={e => {
        e.preventDefault();
        addReview({
          variables: {
            pid: productId,
            comment: myComment
          }
        });
      }}
    >
      <div>
        <label>
          コメント
          <textarea
            value={myComment}
            onChange={e => setMyComment(e.target.value)}
          />
        </label>
      </div>
      <button type="submit" disabled={submitting}>
        追加
      </button>
    </form>
  </>
);
```

ひとまず次のように分割してみましょう（注意: これは誤った分割例です。どこに問題があるかは後述します）。

```tsx
/* src/components/ProductDetail.tsx */

import { useParams } from "react-router-dom";
import { useQuery, useMutation, gql } from "@apollo/client";

import {
  ProductDetailQuery,
  ProductDetailQueryVariables
} from "./__generated__/product-detail-query";

import {
  AddReviewMutation,
  AddReviewMutationVariables
} from "./__generated__/add-review-mutation";

import ProductReview from "./ProductReview";

const query = gql`
  query ProductDetailQuery($id: ID!) {
    product(id: $id) {
      id
      name
      description
      reviews {
        id
        commentBody
      }
    }
  }
`;

const mutation = gql`
  mutation AddReviewMutation($pid: ID!, $comment: String!) {
    addReview(
      productId: $pid
      addReviewInput: { commentBody: $comment, star: 0 }
    ) {
      id
    }
  }
`;

export default function ProductDetail() {
  const { productId } = useParams<{ readonly productId: string }>();
  const { data, loading, refetch } = useQuery<
    ProductDetailQuery,
    ProductDetailQueryVariables
  >(query, {
    variables: {
      id: productId
    }
  });
  const [addReview, { loading: submitting }] = useMutation<
    AddReviewMutation,
    AddReviewMutationVariables
  >(mutation, {
    update(_, { data }) {
      if (!data?.addReview) return;
      refetch();
    }
  });
  if (loading) return <div>loading...</div>;
  if (!data?.product) return <div>not found </div>;
  const { product } = data;
  return (
    <>
      <h1>{product.name}</h1>
      <p style={{ whiteSpace: "pre-wrap" }}>{product.description}</p>
      <div>
        <h2>レビュー</h2>
        <ProductReview
          product={product}
          onSubmit={comment =>
            addReview({ variables: { pid: productId, comment } })
          }
          submitting={submitting}
        />
      </div>
    </>
  );
}
```

```tsx
/* src/components/ProductReview.tsx */

import { useState } from "react";
import { ProductDetailQuery } from "./__generated__/product-detail-query";

type Props = {
  product: ProductDetailQuery["product"];
  submitting: boolean;
  onSubmit: (comment: string) => Promise<any>;
};

export default function ProductReview({
  product,
  submitting,
  onSubmit
}: Props) {
  const [myComment, setMyComment] = useState("");
  if (!product) return null;
  return (
    <>
      {product.reviews.length ? (
        <ul>
          {product.reviews.map(r => (
            <li key={r.id}>{r.commentBody}</li>
          ))}
        </ul>
      ) : (
        <p>レビューはまだありません</p>
      )}
      <form
        onSubmit={async e => {
          e.preventDefault();
          await onSubmit(myComment);
          setMyComment("");
        }}
      >
        <div>
          <label>
            コメント
            <textarea
              value={myComment}
              onChange={e => setMyComment(e.target.value)}
            />
          </label>
        </div>
        <button type="submit" disabled={submitting}>
          追加
        </button>
      </form>
    </>
  );
}
```

アプリケーションの動作確認をしてみてください。分割前と変わらずに実行できるはずです。

### 問題点

実は、先程の分割は保守性に問題があります。

具体的な例で考えてみましょう。

あるとき、「レビューの一覧に ★ の数も出してほしい」と言われたとします。

簡単そうな変更ですね。 `ProductReview` Component を以下のようにすれば良さそうです（GraphQL Schema の `Review` Type には既に `star` というフィールドが定義されていることを思い出してください）。

```tsx
<ul>
  {product.reviews.map(r => (
    <li key={r.id}>
      {/* star を追加 */}
      <div>★: {r.star}個</div>
      <p>{r.commentBody}</p>
    </li>
  ))}
</ul>
```

これだけだと動作しません。なぜならば、 `ProductReview` の Props である `product` というフィールドは商品詳細ページに記載している GraphQL クエリによって決定されるため、このクエリも合わせて修正しないといけないからです。

```graphql
query ProductDetailQuery($id: ID!) {
  product(id: $id) {
    id
    name
    description
    reviews {
      id
      commentBody
      star # 追加する必要がある
    }
  }
}
```

「`star` を `ProductReview` に追加するために、親 Component である `ProductDetail` を修正した」という状態です。

GraphQL における「クエリの決定権がフロントエンドにある」という特性が、上記の修正作業を生み出してしまっているのです。

先程の例はプロパティの追加であったため、 TypeScript の型エラーによって「クエリにフィールドが足りていないこと」に気づけたでしょう。

しかし、逆のケース、すなわちエンハンスで「商品のレビュー一覧から `star` を取り除いてほしい」と言われたとして「クエリから `star` を消す」ということにキチンと思い当たるでしょうか？

余分なフィールドがクエリにあったとしても、 TypeScript 上の型エラーにはなりません。`ProductReview` Component を一生懸命レビューしても気づきにくいと思います。

ちなみに、このように GraphQL Server に画面上では不要なフィールドを問い合わせてしまっている状態のことを Over Fetching と呼びます。Over Fetching は HTTP レスポンスの肥大化や Server Side での無駄な SQL の発行など性能劣化を引き起こす要因となります。GraphQL がフロントエンドにもたらした「自由にクエリを書くことができる」というメリットの裏には「フロントエンドが責任を持って Server のパフォーマンスを守る」がついて回っているということを覚えておいてください。

## 細部のことは細部に任せる

問題の本質は「フィールドを実際に要求している Component」と「クエリを管理している Component」が離れてしまっている点にあります。

React や Vue.js, Angular などのコンポーネント志向な UI フレームワークに親しんでいるのであれば、CSS in JS にせよ、CSS Modules にせよ「その Component が必要とするスタイルはその Component とセットで管理すべきであり、極力グローバルな CSS クラスを書くべきではない」というのは最早当たり前の感覚になっていると思います。

GraphQL でも同じことが言えます。「Component が要求するクエリは Component に閉じて管理すべき」なのです。

## GraphQL クエリの分割と Fragment

クエリを Component に閉じて管理させるためには、GraphQL のクエリが分割できる必要があります。

Fragment という GraphQL の機能（文法）を利用するとこれが実現できます。

商品詳細に対応する `ProductDetailQuery` は以下のように Fragment を使って書き換えることができます。

```graphql
fragment ProductReviewFragment on Product {
  reviews {
    id
    commentBody
  }
}

query ProductDetailQuery($id: ID!) {
  product(id: $id) {
    id
    name
    description
    ...ProductReviewFragment
  }
}
```

Fragment は `fragment フラグメント名 on GraphQLのType名 { フィールドの集合 }` というように定義します。

また、利用時は `...フラグメント名` とすることで、その Fragment が展開されます。JavaScript の Object Spread と似ていますね。

プレイグラウンド上で試してみてください。書き換え前後で一切結果に違いがないことがわかると思います。

ここで重要なのは「 `ProductDetailQuery` は `ProductReviewFragment` という **Fragment 名にのみ依存しており** 、 `reviews.commentBody` のような**詳細なフィールド名は Fragment の定義に隠蔽されている**」ことです。

## Fragment Colocation の導入

さきほど見てきた Fragment 分割を早速 React Component の世界に取り入れてみましょう。

`src/components/ProductReview.tsx` に、この Component に対応する Fragment 情報として以下を記述します。

```ts
export const productReviewFragment = gql`
  fragment ProductReviewFragment on Product {
    reviews {
      id
      commentBody
    }
  }
`;
```

Fragment の記載が終わったら、Query や Mutation の場合と同じ様に TypeScript の型定義を生成します。

```sh
$ npx ts-graphql-plugin typegen
```

生成された `ProductReviewFragment` 型を利用するように `ProductReview` Component の Prop Types を変更します。

最終的に `ProductReview` Component は以下のコードとなります。

```tsx
/* src/components/ProductReview.tsx */

import { useState } from "react";

import { gql } from "@apollo/client";
import { ProductReviewFragment } from "./__generated__/product-review-fragment";

export const productReviewFragment = gql`
  fragment ProductReviewFragment on Product {
    reviews {
      id
      commentBody
    }
  }
`;

type Props = {
  product: ProductReviewFragment;
  submitting: boolean;
  onSubmit: (comment: string) => Promise<any>;
};

export default function ProductReview({
  product,
  submitting,
  onSubmit
}: Props) {
  const [myComment, setMyComment] = useState("");
  return (
    <>
      {product.reviews.length ? (
        <ul>
          {product.reviews.map(r => (
            <li key={r.id}>{r.commentBody}</li>
          ))}
        </ul>
      ) : (
        <p>レビューはまだありません</p>
      )}
      <form
        onSubmit={async e => {
          e.preventDefault();
          await onSubmit(myComment);
          setMyComment("");
        }}
      >
        <div>
          <label>
            コメント
            <textarea
              value={myComment}
              onChange={e => setMyComment(e.target.value)}
            />
          </label>
        </div>
        <button type="submit" disabled={submitting}>
          追加
        </button>
      </form>
    </>
  );
}
```

export した `productReviewFragment` を商品詳細本体のクエリに結合し、 `...ProductReviewFragment` の形式でクエリを書き直します。

```ts
/* src/components/ProductDetail.tsx */

import ProductReview, { productReviewFragment } from "./ProductReview";

const query = gql`
  query ProductDetailQuery($id: ID!) {
    product(id: $id) {
      id
      name
      description
      ...ProductReviewFragment
    }
  }
  ${productReviewFragment}
`;
```

最終的に `ProductDetail` Component は以下のコードとなります。

```tsx
/* src/components/ProductDetail.tsx */

import { useParams } from "react-router-dom";
import { useQuery, useMutation, gql } from "@apollo/client";

import {
  ProductDetailQuery,
  ProductDetailQueryVariables
} from "./__generated__/product-detail-query";

import {
  AddReviewMutation,
  AddReviewMutationVariables
} from "./__generated__/add-review-mutation";

import ProductReview, { productReviewFragment } from "./ProductReview";

const query = gql`
  ${productReviewFragment}
  query ProductDetailQuery($id: ID!) {
    product(id: $id) {
      id
      name
      description
      ...ProductReviewFragment
    }
  }
`;

const mutation = gql`
  mutation AddReviewMutation($pid: ID!, $comment: String!) {
    addReview(
      productId: $pid
      addReviewInput: { commentBody: $comment, star: 0 }
    ) {
      id
    }
  }
`;

export default function ProductDetail() {
  const { productId } = useParams<{ readonly productId: string }>();
  const { data, loading, refetch } = useQuery<
    ProductDetailQuery,
    ProductDetailQueryVariables
  >(query, {
    variables: {
      id: productId
    }
  });
  const [addReview, { loading: submitting }] = useMutation<
    AddReviewMutation,
    AddReviewMutationVariables
  >(mutation, {
    update(_, { data }) {
      if (!data?.addReview) return;
      refetch();
    }
  });
  if (loading) return <div>loading...</div>;
  if (!data?.product) return <div>not found </div>;
  const { product } = data;
  return (
    <>
      <h1>{product.name}</h1>
      <p style={{ whiteSpace: "pre-wrap" }}>{product.description}</p>
      <div>
        <h2>レビュー</h2>
        <ProductReview
          product={product}
          onSubmit={comment =>
            addReview({ variables: { pid: productId, comment } })
          }
          submitting={submitting}
        />
      </div>
    </>
  );
}
```

これで `reviews { commentBody }` のようなレビュー投稿細部の知識を商品詳細から隠すことができました。

## Separation of Concern

Fragment を使ったリファクタリングの結果、React Component と GraphQL Query(Fragment) の関係は下図のようになりました。

```txt

  Component Tree                 GraphQL Query Tree

+-----------------+            +---------------------+
|  ProductDetail  |  ------->  |  ProductDetailQuery |          <====== Colocated Component
+-----------------+    use     +---------------------+
         |                                 |
         | use                             | use
         V                                 V
   +-----------------+            +------------------------+
   |  ProductReview  |  ------->  |  productReviewFragment |    <====== Colocated Component
   +-----------------+    use     +------------------------+

```

重要なのは **「技術(React or GraphQL)の違い( = 縦軸)で分けるのではなく、機能の違い( = 横軸）で分割することで凝集度を高めた」** ということです。

---

[Chapter 2 へ](./02_frontend_dev.md)
