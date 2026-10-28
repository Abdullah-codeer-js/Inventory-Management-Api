import axios from "axios";

const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export const apiOrigin = apiUrl.startsWith("http")
  ? new URL(apiUrl).origin
  : window.location.origin;

export const api = axios.create({ baseURL: apiUrl });

export const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error || error.message;
  }
  return error instanceof Error ? error.message : "An unexpected error occurred.";
};

export type PageResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
};

export type Product = {
  id: number;
  name: string;
  sku: string;
  description: string;
  category_id: number | null;
  supplier_id: number | null;
  category_name: string | null;
  supplier_name: string | null;
  quantity: number;
  unit_price: string | number;
  low_stock_threshold: number;
  image_path: string | null;
  created_at: string;
};

export type NamedResource = {
  id: number;
  name: string;
  description?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  created_at: string;
};
