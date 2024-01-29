use std::borrow::Cow;

#[allow(non_camel_case_types)]
pub enum License<'s> {
    PublicDomain,
    CreativeCommonsBY,
    CreativeCommonsBY_SA,
    CreativeCommonsBY_NC,
    CreativeCommonsBY_NC_SA,
    CreativeCommonsBY_ND,
    CreativeCommonsBY_NC_ND,
    Custom(&'s str),
    CustomOwned(String),
}
impl<'s> License<'s> {
    pub fn from_db_values(ty: u32, str: Option<&'s str>) -> Self {
        match ty {
            0 => Self::PublicDomain,
            1 => Self::CreativeCommonsBY,
            2 => Self::CreativeCommonsBY_SA,
            3 => Self::CreativeCommonsBY_NC,
            4 => Self::CreativeCommonsBY_NC_SA,
            5 => Self::CreativeCommonsBY_ND,
            6 => Self::CreativeCommonsBY_NC_ND,
            _ => Self::Custom(str.unwrap_or("")),
        }
    }

    pub fn into_db_values(self) -> (u32, Option<Cow<'s, str>>) {
        match self {
            Self::PublicDomain => (0, None),
            Self::CreativeCommonsBY => (1, None),
            Self::CreativeCommonsBY_SA => (2, None),
            Self::CreativeCommonsBY_NC => (3, None),
            Self::CreativeCommonsBY_NC_SA => (4, None),
            Self::CreativeCommonsBY_ND => (5, None),
            Self::CreativeCommonsBY_NC_ND => (6, None),
            Self::Custom(s) => (999, Some(Cow::Borrowed(s))),
            Self::CustomOwned(s) => (999, Some(Cow::Owned(s))),
        }
    }
}
impl std::fmt::Display for License<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PublicDomain => f.write_str("CC0 (Public Domain)"),
            Self::CreativeCommonsBY => f.write_str("Creative Commons BY"),
            Self::CreativeCommonsBY_SA => f.write_str("Creative Commons BY-SA"),
            Self::CreativeCommonsBY_NC => f.write_str("Creative Commons BY-NC"),
            Self::CreativeCommonsBY_NC_SA => f.write_str("Creative Commons BY-NC-SA"),
            Self::CreativeCommonsBY_ND => f.write_str("Creative Commons BY-ND"),
            Self::CreativeCommonsBY_NC_ND => f.write_str("Creative Commons BY-NC-ND"),
            Self::Custom(x) => f.write_str(x),
            Self::CustomOwned(x) => f.write_str(x),
        }
    }
}
