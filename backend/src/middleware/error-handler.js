import multer from "multer";

const errorHandler = (error, _request, response, _next) => {
  if (error instanceof multer.MulterError) {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "Image must be 5 MB or smaller."
        : "The image upload was rejected.";
    return response.status(400).json({ error: message });
  }
  if (error.code === "23505")
    return response
      .status(409)
      .json({ error: "A record with that unique value already exists." });
  if (error.code === "23503" || error.code === "23001") {
    if (
      error.table === "products" &&
      (error.constraint?.includes("category") ||
        error.constraint?.includes("supplier"))
    ) {
      return response
        .status(400)
        .json({ error: "The selected category or supplier does not exist." });
    }
    return response
      .status(409)
      .json({
        error: "This record is still referenced and cannot be removed.",
      });
  }
  if (error.code === "23502")
    return response.status(400).json({ error: "A required field is missing." });
  if (error.code === "23514" || error.code === "22P02")
    return response
      .status(400)
      .json({ error: "The submitted values are invalid." });
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  return response
    .status(status)
    .json({
      error:
        status >= 500 ? "An unexpected server error occurred." : error.message,
    });
};

export default errorHandler;
