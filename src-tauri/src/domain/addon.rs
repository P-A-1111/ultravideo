use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use ts_rs::TS;

/// Contrato publico de um add-on. Campos desconhecidos sao preservados em
/// `extensions` -- nunca use `deny_unknown_fields` aqui, senao quebramos
/// add-ons de terceiros que adicionam campos novos.
#[derive(Debug, Clone, Serialize, Deserialize, TS, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub id: String,
    pub version: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub logo: Option<String>,
    #[serde(default)]
    pub background: Option<String>,
    #[serde(default)]
    pub types: Vec<String>,
    #[serde(default)]
    pub resources: Vec<ResourceRef>,
    #[serde(default)]
    pub id_prefixes: Vec<String>,
    #[serde(default)]
    pub catalogs: Vec<CatalogRef>,
    #[serde(default, flatten)]
    pub extensions: HashMap<String, Value>,
}

impl Manifest {
    pub fn validate(&self) -> Result<()> {
        if self.id.trim().is_empty() {
            return Err(AppError::InvalidManifest("campo 'id' vazio".into()));
        }
        if self.version.trim().is_empty() {
            return Err(AppError::InvalidManifest("campo 'version' vazio".into()));
        }
        if self.name.trim().is_empty() {
            return Err(AppError::InvalidManifest("campo 'name' vazio".into()));
        }
        if self.types.is_empty() {
            return Err(AppError::InvalidManifest("campo 'types' vazio".into()));
        }
        Ok(())
    }

    /// Filtra antes de fazer HTTP: tipo de conteudo, prefixo do id e recurso.
    pub fn supports(&self, resource: &str, kind: &str, id: Option<&str>) -> bool {
        if !self.types.iter().any(|t| t == kind || t == "*") {
            return false;
        }

        if let Some(id) = id {
            if !self.id_prefixes.is_empty() && !self.id_prefixes.iter().any(|p| id.starts_with(p)) {
                return false;
            }
        }

        self.resources
            .iter()
            .any(|resource_ref| match resource_ref {
                ResourceRef::Name(name) => name == resource || name == "all",
                ResourceRef::Detailed {
                    name,
                    types,
                    id_prefixes,
                } => {
                    let name_ok = name == resource || name == "all";
                    let kind_ok = types.is_empty() || types.iter().any(|t| t == kind);
                    let id_ok = match id {
                        None => true,
                        Some(id) => {
                            id_prefixes.is_empty()
                                || id_prefixes.iter().any(|prefix| id.starts_with(prefix))
                        }
                    };
                    name_ok && kind_ok && id_ok
                }
            })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(untagged)]
pub enum ResourceRef {
    Name(String),
    Detailed {
        name: String,
        #[serde(default)]
        types: Vec<String>,
        #[serde(default, rename = "idPrefixes")]
        id_prefixes: Vec<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CatalogRef {
    #[serde(rename = "type")]
    pub kind: String,
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub extra: Vec<ExtraRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtraRef {
    pub name: String,
    #[serde(default)]
    pub is_required: bool,
    #[serde(default)]
    pub options: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Descriptor {
    pub manifest: Manifest,
    pub transport_url: String,
}
