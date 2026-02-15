## ct2-soundscape

Public sound archive

## repository

- shared: 共通ロジック
- admin-console: 管理用コンソール（CMSみたいなやつ）
- app: ユーザーに見えるメインの部分

## db migration(local)

`db:generate`は通常はする必要はない（commitに含めているので、scheme変更しなければ`db:migrate-local`だけでいい）

```sh
npm run db:generate -w shared
npm run db:migrate-local -w shared
```

## launch(dev)

### admin-console

```sh
npm run dev -w admin-console
```

### app

```sh
npm run dev -w app
```
