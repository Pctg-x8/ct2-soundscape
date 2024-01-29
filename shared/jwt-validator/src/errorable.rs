pub trait ErrorableExtension: Sized {
    fn or_err<E>(self, err: E) -> Result<(), E>;
}
impl ErrorableExtension for bool {
    #[inline(always)]
    fn or_err<E>(self, err: E) -> Result<(), E> {
        if !self {
            Err(err)
        } else {
            Ok(())
        }
    }
}
