use jwt_validator::{ClaimValidator, JWKs, JsonWebKeysLoader};

#[derive(serde::Serialize)]
pub struct TokenRequestParams<'s> {
    pub grant_type: &'s str,
    pub client_id: &'s str,
    pub client_secret: &'s str,
    pub audience: &'s str,
}

#[derive(serde::Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: u32,
}

#[derive(Debug)]
pub enum RequestTokenError {
    HTTPClient(reqwest::Error),
    URLParseError(url::ParseError),
}
impl From<reqwest::Error> for RequestTokenError {
    fn from(value: reqwest::Error) -> Self {
        Self::HTTPClient(value)
    }
}
impl From<url::ParseError> for RequestTokenError {
    fn from(value: url::ParseError) -> Self {
        Self::URLParseError(value)
    }
}

pub struct Tenancy(url::Url);
impl Tenancy {
    pub fn from_domain(domain: &str) -> Result<Self, url::ParseError> {
        url::Url::parse(&format!("https://{}/", domain)).map(Self)
    }

    pub fn issuer_name(&self) -> &str {
        self.0.as_str()
    }
}
impl JsonWebKeysLoader for Tenancy {
    type Error = reqwest::Error;

    async fn load(&self) -> Result<JWKs, Self::Error> {
        let mut url = self.0.clone();
        url.path_segments_mut()
            .expect("non-base url?")
            .extend([".well-known", "jwks.json"]);

        reqwest::Client::new().get(url).send().await?.json().await
    }
}
#[derive(Debug)]
pub enum TenancyClaimValidationError {
    InvalidIssuer,
}
impl std::fmt::Display for TenancyClaimValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidIssuer => f.write_str("invalid issuer"),
        }
    }
}
impl std::error::Error for TenancyClaimValidationError {}
impl ClaimValidator for Tenancy {
    type Error = TenancyClaimValidationError;

    fn validate(&self, claim: &jwt_validator::Claim) -> Result<(), Self::Error> {
        if !claim
            .iss
            .as_deref()
            .map_or(true, |x| x == self.issuer_name())
        {
            return Err(TenancyClaimValidationError::InvalidIssuer);
        }

        Ok(())
    }
}

#[derive(Debug)]
pub enum APIClaimValidationError {
    InvalidIssuer,
    InvalidAudience,
}
impl std::fmt::Display for APIClaimValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidIssuer => f.write_str("invalid issuer"),
            Self::InvalidAudience => f.write_str("invalid audience"),
        }
    }
}
impl std::error::Error for APIClaimValidationError {}

pub struct APIServerApplication<'t, 's> {
    pub tenancy: &'t Tenancy,
    pub audience: &'s str,
}
impl ClaimValidator for APIServerApplication<'_, '_> {
    type Error = APIClaimValidationError;

    fn validate(&self, claim: &jwt_validator::Claim) -> Result<(), Self::Error> {
        let iss_check = self
            .tenancy
            .validate(claim)
            .map_err(|_| APIClaimValidationError::InvalidIssuer);
        let aud_check = if !claim.aud.as_deref().is_some_and(|x| x == self.audience) {
            Err(APIClaimValidationError::InvalidAudience)
        } else {
            Ok(())
        };

        iss_check.and(aud_check)
    }
}

pub struct APIClientApplication<'t, 's> {
    pub tenancy: &'t Tenancy,
    pub client_id: &'s str,
    pub client_secret: &'s str,
    pub audience: &'s str,
}
impl APIClientApplication<'_, '_> {
    pub async fn request_token(&self) -> Result<TokenResponse, RequestTokenError> {
        let mut url = self.tenancy.0.clone();
        url.path_segments_mut()
            .expect("non-base url?")
            .extend(["oauth", "token"]);

        reqwest::Client::new()
            .post(url)
            .form(&TokenRequestParams {
                grant_type: "client_credentials",
                client_id: self.client_id,
                client_secret: self.client_secret,
                audience: self.audience,
            })
            .send()
            .await?
            .json()
            .await
            .map_err(From::from)
    }
}
impl ClaimValidator for APIClientApplication<'_, '_> {
    type Error = APIClaimValidationError;

    fn validate(&self, claim: &jwt_validator::Claim) -> Result<(), Self::Error> {
        APIServerApplication {
            tenancy: self.tenancy,
            audience: self.audience,
        }
        .validate(claim)
    }
}
