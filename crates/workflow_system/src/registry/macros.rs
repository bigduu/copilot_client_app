//! Registration macros for workflows and categories

/// Macro to register a workflow with the global registry
#[macro_export]
macro_rules! register_workflow {
    ($workflow_type:ty, $name:expr) => {
        inventory::submit! {
            $crate::registry::registries::WorkflowRegistration {
                name: $name,
                constructor: || std::sync::Arc::new(<$workflow_type>::default()),
            }
        }
    };
}

/// Macro to register a category with the global registry
#[macro_export]
macro_rules! register_category {
    ($category_type:ty, $id:expr) => {
        inventory::submit! {
            $crate::registry::registries::CategoryRegistration {
                id: $id,
                constructor: || Box::new(<$category_type>::default()),
            }
        }
    };
}

