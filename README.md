## ct2-soundscape

Public sound archive

## repository

-   shared: 共通ロジック
-   admin-console: 管理用コンソール（CMSみたいなやつ）
-   app: ユーザーに見えるメインの部分

## db migration(local)

`db:generate`は通常はする必要はない（commitに含めているので、scheme変更しなければ`db:migrate-local`だけでいい）

```sh
pnpm shared db:generate
pnpm shared db:migrate-local
```

## launch(dev)

### admin-console

```sh
pnpm admin-console dev
```

### app

```sh
pnpm app dev
```
