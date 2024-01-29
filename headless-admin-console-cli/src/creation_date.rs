use std::str::FromStr;

#[derive(Debug)]
pub enum CreationDateParseError {
    ParseIntError(std::num::ParseIntError),
    MissingElement,
    TooManyElements,
}
impl From<std::num::ParseIntError> for CreationDateParseError {
    fn from(value: std::num::ParseIntError) -> Self {
        Self::ParseIntError(value)
    }
}
impl std::fmt::Display for CreationDateParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ParseIntError(e) => std::fmt::Display::fmt(e, f),
            Self::MissingElement => f.write_str("missing element (requires 3)"),
            Self::TooManyElements => f.write_str("too many elements (expects 3)"),
        }
    }
}
impl std::error::Error for CreationDateParseError {}

#[derive(Clone)]
pub struct CreationDate(u16, u8, u8);
impl CreationDate {
    pub const fn year(&self) -> u16 {
        self.0
    }

    pub const fn month(&self) -> u8 {
        self.1
    }

    pub const fn day(&self) -> u8 {
        self.2
    }
}
impl FromStr for CreationDate {
    type Err = CreationDateParseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let mut elements = s.split('-');
        let y = elements
            .next()
            .ok_or(CreationDateParseError::MissingElement)?
            .parse()?;
        let m = elements
            .next()
            .ok_or(CreationDateParseError::MissingElement)?
            .parse()?;
        let d = elements
            .next()
            .ok_or(CreationDateParseError::MissingElement)?
            .parse()?;
        if elements.any(|_| true) {
            return Err(CreationDateParseError::TooManyElements);
        }

        Ok(Self(y, m, d))
    }
}
impl From<time::Date> for CreationDate {
    fn from(value: time::Date) -> Self {
        Self(value.year() as _, value.month() as _, value.day())
    }
}
