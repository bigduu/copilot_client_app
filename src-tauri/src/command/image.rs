use base64::{engine::general_purpose, Engine as _};
use image::ImageFormat;
use std::fs;
use std::io::Write;
use tauri::Manager;
use tesseract::Tesseract;
use uuid::Uuid;

#[derive(Debug, serde::Serialize)]
pub struct ImageSaveResult {
    pub path: String,
    pub filename: String,
    pub base64_data: Option<String>,
}

#[tauri::command]
pub async fn save_image_to_tmp(
    app: tauri::AppHandle,
    image_data: String,
    file_extension: String,
) -> Result<ImageSaveResult, String> {
    // 移除 data URL 前缀（如果存在）
    let base64_data = if image_data.contains(',') {
        image_data.split(',').nth(1).unwrap_or(&image_data)
    } else {
        &image_data
    };

    // 解码 base64 数据
    let image_bytes = general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    // 获取临时目录
    let temp_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed to get cache directory: {}", e))?
        .join("tmp");

    // 确保临时目录存在
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp directory: {}", e))?;

    // 生成唯一文件名
    let filename = format!("{}.{}", Uuid::new_v4(), file_extension);
    let file_path = temp_dir.join(&filename);

    // 保存文件
    let mut file =
        fs::File::create(&file_path).map_err(|e| format!("Failed to create file: {}", e))?;

    file.write_all(&image_bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(ImageSaveResult {
        path: file_path.to_string_lossy().to_string(),
        filename,
        base64_data: None,
    })
}

#[tauri::command]
pub async fn read_image_file(file_path: String) -> Result<ImageSaveResult, String> {
    // 检查文件是否存在且是图片文件
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err("文件不存在".to_string());
    }

    // 检查文件扩展名
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .ok_or("无法获取文件扩展名")?
        .to_lowercase();

    if !matches!(
        extension.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp"
    ) {
        return Err("不支持的图片格式".to_string());
    }

    // 读取文件内容
    let image_bytes = fs::read(&file_path).map_err(|e| format!("读取文件失败: {}", e))?;

    // 生成唯一文件名
    let filename = format!("{}.{}", Uuid::new_v4(), extension);

    // 获取临时目录
    let temp_dir = std::env::temp_dir().join("copilot_chat_images");
    fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;

    let dest_path = temp_dir.join(&filename);

    // 复制文件到临时目录
    fs::write(&dest_path, &image_bytes).map_err(|e| format!("写入文件失败: {}", e))?;

    // 转换为 base64 用于预览
    let base64_data = general_purpose::STANDARD.encode(&image_bytes);
    let data_url = format!("data:image/{};base64,{}", extension, base64_data);

    Ok(ImageSaveResult {
        path: dest_path.to_string_lossy().to_string(),
        filename,
        base64_data: Some(data_url),
    })
}

#[tauri::command]
pub async fn cleanup_temp_images(app: tauri::AppHandle) -> Result<(), String> {
    let temp_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed to get cache directory: {}", e))?
        .join("tmp");

    if temp_dir.exists() {
        let entries =
            fs::read_dir(&temp_dir).map_err(|e| format!("Failed to read temp directory: {}", e))?;

        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_file() {
                    // 检查文件是否超过 24 小时
                    if let Ok(metadata) = fs::metadata(&path) {
                        if let Ok(modified) = metadata.modified() {
                            let age = std::time::SystemTime::now()
                                .duration_since(modified)
                                .unwrap_or_default();

                            // 删除超过 24 小时的文件
                            if age.as_secs() > 24 * 60 * 60 {
                                let _ = fs::remove_file(&path);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

#[derive(Debug, serde::Serialize)]
pub struct OcrResult {
    pub text: String,
    pub confidence: Option<f32>,
}

#[tauri::command]
pub async fn extract_text_from_image(
    image_path: String,
    language: Option<String>,
) -> Result<OcrResult, String> {
    // Check if file exists
    let path = std::path::Path::new(&image_path);
    if !path.exists() {
        return Err("Image file does not exist".to_string());
    }

    // Load the image
    let img = image::open(&path).map_err(|e| format!("Failed to open image: {}", e))?;

    // Convert to RGB format for better OCR results
    let rgb_img = img.to_rgb8();

    // Create a temporary file for tesseract processing
    let temp_dir = std::env::temp_dir();
    let temp_filename = format!("ocr_temp_{}.png", Uuid::new_v4());
    let temp_path = temp_dir.join(&temp_filename);

    // Save the RGB image as PNG for tesseract
    rgb_img
        .save_with_format(&temp_path, ImageFormat::Png)
        .map_err(|e| format!("Failed to save temp image: {}", e))?;

    // Initialize Tesseract
    let tesseract = Tesseract::new(None, Some(&language.unwrap_or_else(|| "eng".to_string())))
        .map_err(|e| format!("Failed to initialize Tesseract: {}", e))?;

    // Set image path and process
    let mut tesseract = tesseract
        .set_image(&temp_path.to_string_lossy())
        .map_err(|e| format!("Failed to set image: {}", e))?;

    // Extract text
    let text = tesseract
        .get_text()
        .map_err(|e| format!("Failed to extract text: {}", e))?;

    // Get confidence (mean_text_conf returns i32, not Result)
    let confidence = Some(tesseract.mean_text_conf() as f32);

    // Clean up temp file
    let _ = fs::remove_file(&temp_path);

    Ok(OcrResult {
        text: text.trim().to_string(),
        confidence,
    })
}
