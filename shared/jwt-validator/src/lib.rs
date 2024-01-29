use std::collections::HashMap;

use base64::Engine;

mod claim_validator;
pub use self::claim_validator::*;
mod errorable;
use self::errorable::*;

#[derive(serde::Deserialize)]
struct JOSEHeader<'s> {
    pub alg: &'s str,
    #[allow(dead_code)]
    pub typ: &'s str,
    pub kid: Option<&'s str>,
    pub cty: Option<&'s str>,
}

pub trait Base64EngineProvider {
    type Engine: base64::Engine;

    fn engine() -> Self::Engine;
}

pub struct UrlSafeNoPad;
impl Base64EngineProvider for UrlSafeNoPad {
    type Engine = base64::engine::GeneralPurpose;

    fn engine() -> Self::Engine {
        base64::engine::general_purpose::URL_SAFE_NO_PAD
    }
}

#[repr(transparent)]
#[derive(serde::Deserialize)]
#[serde(transparent)]
pub struct Base64String<E: Base64EngineProvider>(pub String, pub std::marker::PhantomData<E>);
impl<E: Base64EngineProvider> Base64String<E> {
    pub fn decode(&self) -> Result<Vec<u8>, base64::DecodeError> {
        E::engine().decode(&self.0)
    }

    pub fn encode(input: &[u8]) -> Self {
        Self(E::engine().encode(input), std::marker::PhantomData)
    }
}

#[derive(serde::Deserialize)]
#[serde(tag = "kty")]
pub enum JWKContent {
    RSA {
        n: Base64String<UrlSafeNoPad>,
        e: Base64String<UrlSafeNoPad>,
    },
}
impl JWKContent {
    /// returns: (n, e) of public key components
    pub fn try_generate_rsa_pubkey(
        &self,
    ) -> Result<Option<(Vec<u8>, Vec<u8>)>, base64::DecodeError> {
        #[allow(irrefutable_let_patterns)]
        if let Self::RSA { n, e } = self {
            Ok(Some((n.decode()?, e.decode()?)))
        } else {
            Ok(None)
        }
    }
}

#[derive(serde::Deserialize)]
#[serde(tag = "kty")]
pub struct JWK {
    #[serde(flatten)]
    content: JWKContent,
    r#use: String,
    alg: Option<String>,
    kid: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct JWKs {
    pub keys: Vec<JWK>,
}

pub trait JsonWebKeysLoader {
    type Error: std::error::Error;

    async fn load(&self) -> Result<JWKs, Self::Error>;
}

#[derive(Debug)]
pub enum ValidationError<JWKsLoaderError: std::error::Error, ClaimValidatorError: std::error::Error>
{
    Illformed,
    Base64(base64::DecodeError),
    StrEncoding(std::str::Utf8Error),
    Json(serde_json::Error),
    JWKsLoader(JWKsLoaderError),
    KeyNotFound,
    InvalidKeyAlgorithm,
    InvalidKeyUsage,
    InvalidKeyType,
    Cipher(<DefaultSV as SignatureVerifier>::Error),
    ClaimValidation(ClaimValidatorError),
}
impl<JWKsLoaderError: std::error::Error, ClaimValidatorError: std::error::Error>
    From<base64::DecodeError> for ValidationError<JWKsLoaderError, ClaimValidatorError>
{
    fn from(value: base64::DecodeError) -> Self {
        Self::Base64(value)
    }
}
impl<JWKsLoaderError: std::error::Error, ClaimValidatorError: std::error::Error>
    From<std::str::Utf8Error> for ValidationError<JWKsLoaderError, ClaimValidatorError>
{
    fn from(value: std::str::Utf8Error) -> Self {
        Self::StrEncoding(value)
    }
}
impl<JWKsLoaderError: std::error::Error, ClaimValidatorError: std::error::Error>
    From<serde_json::Error> for ValidationError<JWKsLoaderError, ClaimValidatorError>
{
    fn from(value: serde_json::Error) -> Self {
        Self::Json(value)
    }
}

#[derive(serde::Deserialize, Debug)]
pub struct Claim {
    pub iss: Option<String>,
    pub sub: Option<String>,
    pub aud: Option<String>,
    pub exp: Option<u64>,
    pub nbf: Option<u64>,
    pub iat: Option<u64>,
    pub jti: Option<String>,
    #[serde(flatten)]
    pub extras: HashMap<String, serde_json::Value>,
}
impl Claim {
    pub fn is_available(&self, nowtime: u64) -> bool {
        self.iat.map_or(true, |x| x <= nowtime) && self.exp.map_or(true, |x| nowtime < x)
    }
}

pub trait SignatureVerifier {
    type Error;

    async fn verify_rs256(
        &self,
        pubkey_n: &[u8],
        pubkey_e: &[u8],
        signature: &[u8],
        message: &[u8],
    ) -> Result<(), Self::Error>;
}

#[cfg(feature = "std")]
pub struct RingSignatureVerifier;
#[cfg(feature = "std")]
impl SignatureVerifier for RingSignatureVerifier {
    type Error = ring::error::Unspecified;

    async fn verify_rs256(
        &self,
        pubkey_n: &[u8],
        pubkey_e: &[u8],
        signature: &[u8],
        message: &[u8],
    ) -> Result<(), Self::Error> {
        ring::signature::RsaPublicKeyComponents {
            n: pubkey_n,
            e: pubkey_e,
        }
        .verify(
            &ring::signature::RSA_PKCS1_2048_8192_SHA256,
            message,
            signature,
        )
    }
}

#[cfg(feature = "web")]
pub struct WebCryptoSignatureVerifier;
#[cfg(feature = "web")]
impl SignatureVerifier for WebCryptoSignatureVerifier {
    type Error = wasm_bindgen::JsValue;

    async fn verify_rs256(
        &self,
        pubkey_n: &[u8],
        pubkey_e: &[u8],
        signature: &[u8],
        message: &[u8],
    ) -> Result<(), Self::Error> {
        use wasm_bindgen::{JsCast, JsValue};

        let sc = js_sys::global()
            .unchecked_into::<web_sys::WorkerGlobalScope>()
            .crypto()?
            .subtle();

        // TODO: 本来はJWKオブジェクトそのままロードできるらしいのでそっちでやったほうがいい
        let jwk_object = js_sys::Object::new();
        js_sys::Reflect::set(
            &jwk_object,
            &JsValue::from_str("kty"),
            &JsValue::from_str("RSA"),
        )?;
        js_sys::Reflect::set(
            &jwk_object,
            &JsValue::from_str("n"),
            &JsValue::from_str(&Base64String::<UrlSafeNoPad>::encode(pubkey_n).0),
        )?;
        js_sys::Reflect::set(
            &jwk_object,
            &JsValue::from_str("e"),
            &JsValue::from_str(&Base64String::<UrlSafeNoPad>::encode(pubkey_e).0),
        )?;
        let params = js_sys::Object::new();
        js_sys::Reflect::set(
            &params,
            &JsValue::from_str("name"),
            &JsValue::from_str("RSASSA-PKCS1-v1_5"),
        )?;
        js_sys::Reflect::set(
            &params,
            &JsValue::from_str("hash"),
            &JsValue::from_str("SHA-256"),
        )?;
        let usage = js_sys::Array::new();
        usage.push(&JsValue::from_str("verify"));
        let pk: web_sys::CryptoKey = wasm_bindgen_futures::JsFuture::from(
            sc.import_key_with_object("jwk", &jwk_object, &params, false, &usage)?,
        )
        .await?
        .into();

        let valid =
            wasm_bindgen_futures::JsFuture::from(sc.verify_with_str_and_u8_array_and_u8_array(
                "RSASSA-PKCS1-v1_5",
                &pk,
                // TODO: immutableにする変更はmainに入っているがまだunreleasedなので一旦こうする
                #[allow(mutable_transmutes)]
                unsafe {
                    std::mem::transmute(signature)
                },
                #[allow(mutable_transmutes)]
                unsafe {
                    std::mem::transmute(message)
                },
            )?)
            .await?;
        valid
            .as_bool()
            .is_some_and(|x| x)
            .or_err(js_sys::Error::new("invalid signature").into())
    }
}

#[cfg(feature = "std")]
type DefaultSV = RingSignatureVerifier;
#[cfg(feature = "web")]
type DefaultSV = WebCryptoSignatureVerifier;

pub async fn validate<L: JsonWebKeysLoader, CV: ClaimValidator>(
    token: &str,
    jwks_loader: &L,
    claim_validator: &CV,
) -> Result<(), ValidationError<L::Error, CV::Error>> {
    let TokenType::JWS {
        header,
        claim,
        signature,
    } = split(token).ok_or(ValidationError::Illformed)?
    else {
        unimplemented!("JWE validation is not implemented");
    };

    let header_json_str = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(header)?;
    let header: JOSEHeader = serde_json::from_str(std::str::from_utf8(&header_json_str)?)?;

    if header.cty.is_some_and(|s| s == "JWT") {
        unimplemented!("nested jwt token is not supported");
    }

    let payload_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(claim)?;
    let payload: Claim = serde_json::from_str(std::str::from_utf8(&payload_bytes)?)?;

    let signature_target_message = &token[..(token.len() - signature.len() - 1)];
    let target_signature = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(signature)?;
    let keyset = jwks_loader
        .load()
        .await
        .map_err(ValidationError::JWKsLoader)?;
    'verification: {
        #[cfg(feature = "std")]
        let verifier = RingSignatureVerifier;
        #[cfg(feature = "web")]
        let verifier = WebCryptoSignatureVerifier;

        if let Some(kid) = header.kid {
            // use specified key
            let key = keyset
                .keys
                .iter()
                .find(|k| k.kid.as_deref().is_some_and(|x| x == kid))
                .ok_or(ValidationError::KeyNotFound)?;
            (key.r#use == "sig").or_err(ValidationError::InvalidKeyUsage)?;
            key.alg
                .as_deref()
                .map_or(true, |x| x == header.alg)
                .or_err(ValidationError::InvalidKeyAlgorithm)?;
            let Some((pubkey_n, pubkey_e)) = key.content.try_generate_rsa_pubkey()? else {
                return Err(ValidationError::InvalidKeyType);
            };

            verifier
                .verify_rs256(
                    &pubkey_n,
                    &pubkey_e,
                    &target_signature,
                    signature_target_message.as_bytes(),
                )
                .await
                .map_err(ValidationError::Cipher)?;

            break 'verification;
        }

        // try all candidate keys
        let candidate_keys = keyset
            .keys
            .iter()
            .filter(|k| k.r#use == "sig" && k.alg.as_deref().map_or(true, |x| x == header.alg))
            .filter_map(|k| k.content.try_generate_rsa_pubkey().transpose());

        for k in candidate_keys {
            let (pubkey_n, pubkey_e) = k?;

            if verifier
                .verify_rs256(
                    &pubkey_n,
                    &pubkey_e,
                    &target_signature,
                    signature_target_message.as_bytes(),
                )
                .await
                .is_ok()
            {
                // success!
                break 'verification;
            }
        }

        return Err(ValidationError::KeyNotFound);
    }

    claim_validator
        .validate(&payload)
        .map_err(ValidationError::ClaimValidation)?;

    Ok(())
}

pub enum TokenType<'s> {
    JWS {
        header: &'s str,
        claim: &'s str,
        signature: &'s str,
    },
    JWE {
        header: &'s str,
        encrypted_key: &'s str,
        initialization_vector: &'s str,
        ciphertext: &'s str,
        authentication_tag: &'s str,
    },
}

fn split(token: &str) -> Option<TokenType> {
    let mut xs = token.split('.');
    let header = xs.next()?;
    let part1 = xs.next()?;
    let part2 = xs.next()?;
    let part3 = xs.next();
    let part4 = xs.next();

    if xs.any(|_| true) {
        // too many parts
        return None;
    }

    match (header, part1, part2, part3, part4) {
        (header, claim, signature, None, None) => Some(TokenType::JWS {
            header,
            claim,
            signature,
        }),
        (header, ekey, iv, Some(txt), Some(tag)) => Some(TokenType::JWE {
            header,
            encrypted_key: ekey,
            initialization_vector: iv,
            ciphertext: txt,
            authentication_tag: tag,
        }),
        _ => None,
    }
}
