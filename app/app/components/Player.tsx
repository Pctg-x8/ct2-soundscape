export default function Player({ source }: { readonly source?: string }) {
    return <section>{source ? <audio src={source} controls /> : undefined}</section>;
}
