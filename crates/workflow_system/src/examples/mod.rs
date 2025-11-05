//! Example workflows for demonstration and testing

pub mod create_file_workflow;
pub mod delete_file_workflow;
pub mod echo_workflow;
pub mod execute_command_workflow;

pub use create_file_workflow::CreateFileWorkflow;
pub use delete_file_workflow::DeleteFileWorkflow;
pub use echo_workflow::EchoWorkflow;
pub use execute_command_workflow::ExecuteCommandWorkflow;
