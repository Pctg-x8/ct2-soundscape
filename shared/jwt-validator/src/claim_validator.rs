use crate::errorable::ErrorableExtension;

use super::Claim;

pub trait ClaimValidator {
    type Error: std::error::Error;

    fn validate(&self, claim: &Claim) -> Result<(), Self::Error>;

    #[inline(always)]
    fn by_ref(&self) -> &Self {
        self
    }

    #[inline(always)]
    fn and<B>(self, other: B) -> ChainedClaimValidator<Self, B>
    where
        Self: Sized,
    {
        ChainedClaimValidator(self, other)
    }
}
impl<T: ClaimValidator> ClaimValidator for &'_ T {
    type Error = T::Error;

    fn validate(&self, claim: &Claim) -> Result<(), Self::Error> {
        T::validate(self, claim)
    }
}
#[derive(Debug)]
pub enum ChainedClaimValidatorError<A, B> {
    CaseA(A),
    CaseB(B),
}
impl<A: std::fmt::Display, B: std::fmt::Display> std::fmt::Display
    for ChainedClaimValidatorError<A, B>
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::CaseA(a) => std::fmt::Display::fmt(a, f),
            Self::CaseB(b) => std::fmt::Display::fmt(b, f),
        }
    }
}
impl<A: std::error::Error, B: std::error::Error> std::error::Error
    for ChainedClaimValidatorError<A, B>
{
}
pub struct ChainedClaimValidator<A, B>(A, B);
impl<A: ClaimValidator, B: ClaimValidator> ClaimValidator for ChainedClaimValidator<A, B> {
    type Error = ChainedClaimValidatorError<A::Error, B::Error>;

    #[inline]
    fn validate(&self, claim: &Claim) -> Result<(), Self::Error> {
        match (self.0.validate(claim), self.1.validate(claim)) {
            (Err(e), _) => Err(ChainedClaimValidatorError::CaseA(e)),
            (_, Err(e)) => Err(ChainedClaimValidatorError::CaseB(e)),
            _ => Ok(()),
        }
    }
}

#[derive(Debug)]
pub struct OutOfDateError;
impl std::fmt::Display for OutOfDateError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("token is out of date")
    }
}
impl std::error::Error for OutOfDateError {}
pub struct TimeAvailabilityValidator(pub u64);
impl TimeAvailabilityValidator {
    #[cfg(feature = "std")]
    pub fn for_now() -> Self {
        Self(time::OffsetDateTime::now_utc().unix_timestamp() as _)
    }

    #[cfg(feature = "web")]
    pub fn for_now() -> Self {
        Self((js_sys::Date::now() / 1_000.0) as _)
    }
}
impl ClaimValidator for TimeAvailabilityValidator {
    type Error = OutOfDateError;

    fn validate(&self, claim: &Claim) -> Result<(), Self::Error> {
        claim.is_available(self.0).or_err(OutOfDateError)
    }
}
