import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Checkbox,
  Group,
  Loader,
  Modal,
  Pagination,
  Paper,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconArrowLeft,
  IconBookUpload,
  IconEdit,
  IconExclamationCircle,
  IconFileText,
  IconFolderPlus,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { useRouter } from "@tanstack/react-router";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Chunk, ReviewInfo, UploadQueueState } from "./types";
import { UploadProgressPanel } from "./UploadProgress";
import { UploadQueue } from "./UploadQueue";
import { validateFiles } from "./validation";

// ========== 类型定义 ==========

interface Dataset {
  dataset_id: string;
  name: string;
  description?: string;
  doc_count?: number;
  slice_count?: number;
  char_count?: number;
  status?: number;
  create_time?: number;
  update_time?: number;
  icon_url?: string;
  icon_uri?: string;
  creator_id?: string;
  creator_name?: string;
  format_type?: number;
  storage_location?: number;
  space_id?: string;
  file_list?: string[]; // 文件名列表，直接从 /v1/datasets 返回
  failed_file_list?: string[]; // 失败文件列表
}

interface CreateDocumentResponse {
  document_infos: { document_id: string; name: string }[];
  code: number;
  msg: string;
}

interface ListDatasetsResponse {
  data?: {
    dataset_list: Dataset[];
    total_count: number;
  };
  code: number;
  msg: string;
}

interface CreateDatasetResponse {
  dataset_id: string;
  code: number;
  msg: string;
}

// ========== Document 类型定义 ==========

// DocumentStatus: 0=处理中, 1=已完成, 2=已禁用, 3=已删除, 4=重新切片中, 5=刷新中, 9=失败
const DocumentStatusMap: Record<number, { label: string; color: string }> = {
  0: { label: "处理中", color: "blue" },
  1: { label: "已完成", color: "green" },
  2: { label: "已禁用", color: "gray" },
  3: { label: "已删除", color: "red" },
  4: { label: "重新切片中", color: "yellow" },
  5: { label: "刷新中", color: "cyan" },
  9: { label: "失败", color: "red" },
};

interface Document {
  document_id: string;
  name: string;
  status: number;
  slice_count: number;
  char_count: number;
  size: number;
  type: string;
  create_time: number;
  update_time?: number;
  status_descript?: string;
  source_file_id?: string;
}

interface ListDocumentResponse {
  document_infos: Document[];
  total: number;
  code: number;
  msg: string;
}

interface UpdateDocumentResponse {
  document_info: Document;
  code: number;
  msg: string;
}

// ========== API 配置 ==========

// @ts-ignore
const API_BASE_URL =
  window.APP_CONFIG?.API_BASE_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://ai.yuecin.com:40011/api";

// ========== API 函数 ==========

// 辅助函数：文件转 base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 去掉 data:image/...;base64, 前缀
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 辅助函数：根据文件名获取文档类型
function getDocumentType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const typeMap: Record<string, string> = {
    pdf: "pdf",
    docx: "docx",
    doc: "doc",
    txt: "txt",
    md: "md",
  };
  return typeMap[ext || ""] || "unknown";
}

const cozeApi = {
  // 上传文件到 Coze
  async uploadFile(file: File): Promise<{ upload_url: string; upload_uri: string }> {
    const base64 = await fileToBase64(file);

    const payload = {
      file_head: {
        file_type: getDocumentType(file.name),
        biz_type: 2, // BIZ_BOT_DATASET = 2
      },
      data: base64,
    };

    const response = await fetch(`${API_BASE_URL}/api/bot/upload_file`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`上传失败: ${response.statusText}`);
    }

    const data = await response.json();
    // 新响应结构: { code, msg, data: { upload_url, upload_uri } }
    if (data.code !== 0) {
      throw new Error(data.msg || "上传失败");
    }
    return data.data;
  },

  // 创建审查
  async createReview(
    datasetId: string,
    uploadUri: string,
    documentName: string,
    documentType: string,
  ): Promise<{
    dataset_id: string;
    reviews: { review_id: string; document_name: string; document_type: string; tos_url: string }[];
  }> {
    const response = await fetch(`${API_BASE_URL}/api/knowledge/review/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset_id: datasetId,
        reviews: [
          {
            document_name: documentName,
            document_type: documentType,
            tos_uri: uploadUri,
          },
        ],
        chunk_strategy: {
          chunk_type: 0,
        },
        parsing_strategy: {
          parsing_type: 0,
          image_extraction: true,
          table_extraction: true,
          image_ocr: true,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`创建审查失败: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(data.msg || "创建审查失败");
    }

    return data;
  },

  // 获取文档分片预览
  async mgetReview(
    datasetId: string,
    reviewIds: string[],
  ): Promise<{ dataset_id: string; reviews: ReviewInfo[] }> {
    const response = await fetch(`${API_BASE_URL}/api/knowledge/review/mget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset_id: datasetId,
        review_ids: reviewIds,
      }),
    });

    if (!response.ok) {
      throw new Error(`获取审查详情失败: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(data.msg || "获取审查详情失败");
    }

    return data;
  },

  // 获取 chunks（转换 doc_tree_tos_url 域名）
  async getChunks(
    docTreeTosUrl: string,
  ): Promise<{ chunks: { id: string; text: string; type: string }[] }> {
    // 将 http://minio:9000/opencoze/DocReview/xxx.txt
    // 转换为 http://ai.yuecin.com:40010/local_storage/opencoze/DocReview/xxx.txt
    const chunksUrl = docTreeTosUrl.replace(
      /^http:\/\/[^/]+/,
      "http://ai.yuecin.com:40010/local_storage",
    );

    const response = await fetch(chunksUrl);

    if (!response.ok) {
      throw new Error(`获取文档切片失败: ${response.statusText}`);
    }

    return response.json();
  },

  // 保存 chunks
  async saveReview(
    datasetId: string,
    reviewId: string,
    chunks: { id: string; text: string }[],
  ): Promise<{ code: number; msg: string }> {
    const docTreeJson = JSON.stringify(chunks);

    const response = await fetch(`${API_BASE_URL}/api/knowledge/review/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset_id: datasetId,
        doc_tree_json: docTreeJson,
        review_id: reviewId,
      }),
    });

    if (!response.ok) {
      throw new Error(`保存切片失败: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(data.msg || "保存切片失败");
    }

    return data;
  },

  // 创建 knowledge 文档
  async createKnowledgeDocument(
    datasetId: string,
    name: string,
    tosUri: string,
    reviewId: string,
  ): Promise<{ document_infos: { document_id: string; name: string }[] }> {
    const response = await fetch(`${API_BASE_URL}/api/knowledge/document/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset_id: datasetId,
        format_type: 0,
        document_bases: [
          {
            name: name,
            source_info: {
              tos_uri: tosUri,
              document_source: 0,
              review_id: reviewId,
            },
          },
        ],
        chunk_strategy: {
          chunk_type: 0,
        },
        parsing_strategy: {
          parsing_type: 0,
          image_extraction: true,
          table_extraction: true,
          image_ocr: true,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`创建知识库文档失败: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(data.msg || "创建知识库文档失败");
    }

    return data;
  },

  // 创建数据集
  async createDataset(
    name: string,
    description = "",
    spaceId = "7626374491127414784",
  ): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/v1/datasets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        space_id: spaceId,
      }),
    });

    if (!response.ok) {
      throw new Error(`创建数据集失败: ${response.statusText}`);
    }

    const data: CreateDatasetResponse = await response.json();
    if (data.code !== 0) {
      throw new Error(data.msg || "创建数据集失败");
    }

    return data.dataset_id;
  },

  // 获取数据集列表
  async listDatasets(page = 1, size = 20): Promise<{ datasets: Dataset[]; total: number }> {
    const params = new URLSearchParams({
      page_num: String(page),
      page_size: String(size),
      space_id: "7626374491127414784",
      // project_id: "7626374607464824832",
    });
    const response = await fetch(`${API_BASE_URL}/v1/datasets?${params}`, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`获取数据集列表失败: ${response.statusText}`);
    }

    const result: ListDatasetsResponse = await response.json();
    if (result.code !== 0) {
      throw new Error(result.msg || "获取数据集列表失败");
    }

    return { datasets: result.data?.dataset_list || [], total: result.data?.total_count || 0 };
  },

  // 删除数据集
  async deleteDataset(datasetId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/v1/datasets/${datasetId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`删除数据集失败: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(data.msg || "删除数据集失败");
    }
  },

  // 删除文档（此接口存在但暂无法使用，因为 file_list 不包含 document_id）
  async deleteDocuments(datasetId: string, documentIds: string[]): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/open_api/knowledge/document/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset_id: datasetId,
        document_ids: documentIds,
      }),
    });

    if (!response.ok) {
      throw new Error(`删除文档失败: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.code !== 0 && data.BaseResp?.StatusCode !== 0) {
      throw new Error(data.msg || data.BaseResp?.StatusMessage || "删除文档失败");
    }
  },

  // 获取文档列表（包含 document_id）
  async listDocuments(
    datasetId: string,
    page = 0,
    size = 50,
  ): Promise<{ documents: Document[]; total: number }> {
    const response = await fetch(`${API_BASE_URL}/open_api/knowledge/document/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset_id: datasetId,
        page,
        size,
      }),
    });

    if (!response.ok) {
      throw new Error(`获取文档列表失败: ${response.statusText}`);
    }

    const data = await response.json();
    // 响应结构是 { document_infos: [], total: n, BaseResp: { StatusCode: 0 } }
    if (data.BaseResp?.StatusCode !== 0) {
      throw new Error(data.BaseResp?.StatusMessage || "获取文档列表失败");
    }

    return { documents: data.document_infos || [], total: data.total || 0 };
  },

  // 更新文档（重命名）
  async updateDocument(
    datasetId: string,
    documentId: string,
    documentName: string,
  ): Promise<Document> {
    const response = await fetch(`${API_BASE_URL}/open_api/knowledge/document/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset_id: datasetId,
        document_id: documentId,
        document_name: documentName,
      }),
    });

    if (!response.ok) {
      throw new Error(`更新文档失败: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.code !== 0 && data.BaseResp?.StatusCode !== 0) {
      throw new Error(data.msg || data.BaseResp?.StatusMessage || "更新文档失败");
    }

    return data.document_info;
  },
};

// ========== 组件 ==========

const KnowledgeBasePage: React.FC = () => {
  const router = useRouter();

  // 状态
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [datasetPage, setDatasetPage] = useState(0);
  const [totalDatasets, setTotalDatasets] = useState(0);

  // 文档列表状态
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsTotal, setDocumentsTotal] = useState(0);
  const [documentPage, setDocumentPage] = useState(0);
  const [documentPageSize, setDocumentPageSize] = useState(10);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());

  // 上传队列
  const uploadQueue = useMemo(
    () =>
      new UploadQueue(
        { maxConcurrent: 3, maxRetries: 3 },
        cozeApi.uploadFile.bind(cozeApi),
        cozeApi.createReview.bind(cozeApi),
        cozeApi.mgetReview.bind(cozeApi),
        cozeApi.getChunks.bind(cozeApi),
        cozeApi.saveReview.bind(cozeApi),
        cozeApi.createKnowledgeDocument.bind(cozeApi),
      ),
    [],
  );
  const [uploadState, setUploadState] = useState<UploadQueueState>(uploadQueue.getState());
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 创建数据集弹窗
  const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] =
    useDisclosure(false);
  const [newDatasetName, setNewDatasetName] = useState("");
  const [newDatasetDesc, setNewDatasetDesc] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // 删除确认弹窗
  const [deleteDialogOpened, { open: openDeleteDialog, close: closeDeleteDialog }] =
    useDisclosure(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // 删除文档弹窗
  const [deleteDocDialogOpened, { open: openDeleteDocDialog, close: closeDeleteDocDialog }] =
    useDisclosure(false);
  const [deleteDocTarget, setDeleteDocTarget] = useState<{ id: string; name: string } | null>(null);

  // 批量删除文档弹窗
  const [batchDeleteDialogOpened, { open: openBatchDeleteDialog, close: closeBatchDeleteDialog }] =
    useDisclosure(false);

  // 编辑文档弹窗
  const [editDocDialogOpened, { open: openEditDocDialog, close: closeEditDocDialog }] =
    useDisclosure(false);
  const [editDocTarget, setEditDocTarget] = useState<{ id: string; name: string } | null>(null);
  const [editDocName, setEditDocName] = useState("");

  // 加载数据集
  const fetchDatasets = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const { datasets: ds, total } = await cozeApi.listDatasets(datasetPage, 20);
        setDatasets(ds);
        setTotalDatasets(total);
      } catch (error: any) {
        console.error("获取数据集列表失败:", error);
        if (!silent) toast.error("获取数据集列表失败");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [datasetPage],
  );

  // 初始化
  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  // 文档分页变化时重新获取
  useEffect(() => {
    if (selectedDataset?.dataset_id) {
      fetchDocuments(selectedDataset.dataset_id, true);
    }
  }, [documentPage, selectedDataset?.dataset_id]);

  // 同步上传队列状态
  useEffect(() => {
    const interval = setInterval(() => {
      setUploadState(uploadQueue.getState());
    }, 500);
    return () => clearInterval(interval);
  }, [uploadQueue]);

  // 文档处理状态轮询 - 当有文档处于处理中状态时持续刷新
  useEffect(() => {
    if (!selectedDataset?.dataset_id) return;

    // 检查是否有处理中的文档 (status=0)
    const hasProcessingDocs = documents.some((doc) => doc.status === 0);

    if (!hasProcessingDocs) return;

    // 每 2 秒刷新一次文档列表，直到没有处理中的文档
    const pollInterval = setInterval(() => {
      fetchDocuments(selectedDataset.dataset_id, true);
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [selectedDataset?.dataset_id, documents]);

  // 获取文档列表
  const fetchDocuments = useCallback(
    async (datasetId: string, silent = false) => {
      if (!silent) setDocumentsLoading(true);
      try {
        const { documents: docs, total } = await cozeApi.listDocuments(
          datasetId,
          documentPage,
          documentPageSize,
        );
        setDocuments(docs);
        setDocumentsTotal(total);
      } catch (error: any) {
        console.error("获取文档列表失败:", error);
        if (!silent) toast.error("获取文档列表失败");
        setDocuments([]);
        setDocumentsTotal(0);
      } finally {
        if (!silent) setDocumentsLoading(false);
      }
    },
    [documentPage],
  );

  // 处理选择的文件（放在 fetchDocuments 之后）
  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (!selectedDataset) {
        toast.error("请先选择一个知识库");
        return;
      }

      uploadQueue.addFiles(files);
      setShowUploadPanel(true);

      await uploadQueue.start(selectedDataset.dataset_id);

      // 上传完成后刷新数据
      await fetchDatasets(true);
      if (selectedDataset?.dataset_id) {
        await fetchDocuments(selectedDataset.dataset_id, true);
      }
    },
    [selectedDataset, uploadQueue, fetchDatasets, fetchDocuments],
  );

  // 选择数据集
  const handleSelectDataset = useCallback(
    async (dataset: Dataset) => {
      setSelectedDataset(dataset);
      setDocumentPage(0);
      if (dataset.dataset_id) {
        await fetchDocuments(dataset.dataset_id);
      }
    },
    [fetchDocuments],
  );

  // 确认删除文档
  const confirmDeleteDoc = useCallback(async () => {
    if (!deleteDocTarget || !selectedDataset) return;

    const toastId = toast.loading("正在删除文档...");
    try {
      await cozeApi.deleteDocuments(selectedDataset.dataset_id, [deleteDocTarget.id]);
      toast.success("文档已删除", { id: toastId });
      await fetchDocuments(selectedDataset.dataset_id);
      await fetchDatasets(true);
    } catch (error: any) {
      toast.error(`删除失败: ${error.message}`, { id: toastId });
    } finally {
      closeDeleteDocDialog();
      setDeleteDocTarget(null);
    }
  }, [deleteDocTarget, selectedDataset, fetchDocuments, fetchDatasets]);

  // 打开删除文档确认
  const openDeleteDocConfirm = (docId: string, docName: string) => {
    setDeleteDocTarget({ id: docId, name: docName });
    openDeleteDocDialog();
  };

  // 批量删除文档
  const confirmBatchDeleteDocs = useCallback(async () => {
    if (selectedDocIds.size === 0 || !selectedDataset) return;

    const toastId = toast.loading(`正在删除 ${selectedDocIds.size} 个文档...`);
    try {
      await cozeApi.deleteDocuments(selectedDataset.dataset_id, Array.from(selectedDocIds));
      toast.success(`已删除 ${selectedDocIds.size} 个文档`, { id: toastId });
      setSelectedDocIds(new Set());
      await fetchDocuments(selectedDataset.dataset_id);
      await fetchDatasets(true);
    } catch (error: any) {
      toast.error(`删除失败: ${error.message}`, { id: toastId });
    } finally {
      closeBatchDeleteDialog();
    }
  }, [selectedDocIds, selectedDataset, fetchDocuments, fetchDatasets]);

  // 编辑文档
  const handleEditDoc = (docId: string, docName: string) => {
    setEditDocTarget({ id: docId, name: docName });
    setEditDocName(docName);
    openEditDocDialog();
  };

  // 确认编辑文档
  const confirmEditDoc = useCallback(async () => {
    if (!editDocTarget || !selectedDataset || !editDocName.trim()) return;

    const toastId = toast.loading("正在更新文档...");
    try {
      await cozeApi.updateDocument(
        selectedDataset.dataset_id,
        editDocTarget.id,
        editDocName.trim(),
      );
      toast.success("文档已更新", { id: toastId });
      await fetchDocuments(selectedDataset.dataset_id);
    } catch (error: any) {
      toast.error(`更新失败: ${error.message}`, { id: toastId });
    } finally {
      closeEditDocDialog();
      setEditDocTarget(null);
      setEditDocName("");
    }
  }, [editDocTarget, selectedDataset, editDocName, fetchDocuments]);

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
  };

  // 格式化时间戳
  const formatDate = (timestamp: number): string => {
    if (!timestamp) return "-";
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 创建数据集
  const handleCreateDataset = async () => {
    if (!newDatasetName.trim()) {
      toast.error("请输入数据集名称");
      return;
    }

    setIsCreating(true);
    try {
      await cozeApi.createDataset(newDatasetName.trim(), newDatasetDesc.trim());
      toast.success("数据集创建成功！");
      closeCreateModal();
      setNewDatasetName("");
      setNewDatasetDesc("");
      await fetchDatasets();
    } catch (error: any) {
      toast.error(`创建失败: ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  // 确认删除
  const confirmDelete = () => {
    if (!deleteTarget) return;

    const targetId = deleteTarget.id;

    const deleteAsync = async () => {
      const toastId = toast.loading("正在删除...");
      try {
        await cozeApi.deleteDataset(targetId);
        toast.success("数据集已删除", { id: toastId });
        setSelectedDataset(null);
        await fetchDatasets();
      } catch (error: any) {
        toast.error(`删除失败: ${error.message}`, { id: toastId });
      }
    };

    deleteAsync();
    closeDeleteDialog();
    setDeleteTarget(null);
  };

  // 打开删除确认
  const openDeleteConfirm = (id: string, name: string) => {
    setDeleteTarget({ id, name });
    openDeleteDialog();
  };

  // 拖拽上传处理
  const handlePageDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (selectedDataset) setIsDragOver(true);
    },
    [selectedDataset],
  );

  const handlePageDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handlePageDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (!selectedDataset) {
        toast.error("请先选择一个知识库");
        return;
      }

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      // 验证文件
      const { valid, invalid } = validateFiles(files);
      invalid.forEach(({ file, error }) => {
        toast.error(`${file.name}: ${error}`);
      });

      if (valid.length > 0) {
        void handleFilesSelected(valid);
      }
    },
    [selectedDataset, handleFilesSelected],
  );

  // 点击上传按钮
  const handleUploadButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // 文件选择处理
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      const { valid, invalid } = validateFiles(files);
      invalid.forEach(({ file, error }) => {
        toast.error(`${file.name}: ${error}`);
      });

      if (valid.length > 0) {
        void handleFilesSelected(valid);
      }

      e.target.value = "";
    },
    [handleFilesSelected],
  );

  // 总页数
  const totalDatasetPages = Math.ceil(totalDatasets / 20) || 1;

  // ========== 渲染 ==========

  return (
    <Stack
      p="md"
      gap="xl"
      h="100%"
      style={{ overflowY: "auto" }}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      {/* 拖拽上传提示层 */}
      {isDragOver && selectedDataset && (
        <Box
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <Paper withBorder p="xl" radius="md" style={{ textAlign: "center" }}>
            <IconUpload size={48} color="var(--mantine-color-blue-filled)" />
            <Text size="lg" fw={500} mt="md">
              释放文件上传到「{selectedDataset.name}」
            </Text>
          </Paper>
        </Box>
      )}

      {/* 顶部导航 */}
      <Group justify="space-between" align="center">
        <Group align="flex-start" gap="md">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            title="返回聊天"
            onClick={() => router.history.back()}
          >
            <IconArrowLeft size={24} />
          </ActionIcon>
          <div>
            <Title order={4} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <IconBookUpload size={24} color="var(--mantine-color-blue-filled)" />
              专属知识库
            </Title>
            <Text size="sm" c="dimmed" mt={4}>
              上传本地文档，让大模型深度阅读并为您提供精准解答。
            </Text>
          </div>
        </Group>

        <Group>
          <Button leftSection={<IconFolderPlus size={16} />} color="teal" onClick={openCreateModal}>
            新建知识库
          </Button>
        </Group>
      </Group>

      {/* 加载状态 */}
      {loading && !selectedDataset && (
        <Center py="xl">
          <Loader size="lg" />
        </Center>
      )}

      {/* 数据集选择 + 文档列表 */}
      {!loading && (
        <Group align="flex-start" gap="xl" style={{ width: "100%" }}>
          {/* 数据集列表 */}
          <Paper
            withBorder
            radius="md"
            shadow="sm"
            style={{ width: 320, flexShrink: 0, maxHeight: 800, overflowY: "auto" }}
          >
            <Stack p="md" gap="sm">
              <Text fw={600} size="sm">
                知识库列表
              </Text>

              {datasets.length === 0 ? (
                <Text c="dimmed" size="sm" ta="center" py="md">
                  暂无知识库，请新建
                </Text>
              ) : (
                <>
                  {datasets.map((ds) => (
                    <Card
                      key={ds.dataset_id}
                      withBorder
                      padding="sm"
                      radius="md"
                      style={{
                        cursor: "pointer",
                        borderColor:
                          selectedDataset?.dataset_id === ds.dataset_id
                            ? "var(--mantine-color-blue-filled)"
                            : undefined,
                        backgroundColor:
                          selectedDataset?.dataset_id === ds.dataset_id
                            ? "var(--mantine-color-blue-0)"
                            : undefined,
                      }}
                      onClick={() => handleSelectDataset(ds)}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <div style={{ overflow: "hidden" }}>
                          <Text size="sm" fw={500} truncate title={ds.name}>
                            {ds.name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {ds.doc_count || 0} 个文档
                          </Text>
                        </div>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteConfirm(ds.dataset_id, ds.name);
                          }}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Card>
                  ))}

                  {totalDatasetPages > 1 && (
                    <Pagination
                      total={totalDatasetPages}
                      value={datasetPage}
                      onChange={setDatasetPage}
                      size="xs"
                      mt="sm"
                    />
                  )}
                </>
              )}
            </Stack>
          </Paper>

          {/* 文档列表 */}
          <Stack style={{ flex: 1 }} gap="md">
            {selectedDataset ? (
              <>
                <Group justify="space-between">
                  <Text fw={600}>{selectedDataset.name} - 文档列表</Text>
                  <Group>
                    <input
                      type="file"
                      accept=".pdf,.txt,.md,.docx,.doc"
                      multiple
                      style={{ display: "none" }}
                      ref={fileInputRef}
                      onChange={handleFileInputChange}
                    />
                    <SegmentedControl
                      size="xs"
                      data={[
                        { label: "10条/页", value: "10" },
                        { label: "15条/页", value: "15" },
                      ]}
                      value={String(documentPageSize)}
                      onChange={(v) => {
                        setDocumentPageSize(Number(v));
                        setDocumentPage(0);
                      }}
                    />
                    {selectedDocIds.size > 0 && (
                      <Button
                        leftSection={<IconTrash size={16} />}
                        color="red"
                        size="xs"
                        variant="light"
                        onClick={openBatchDeleteDialog}
                      >
                        删除已选 ({selectedDocIds.size})
                      </Button>
                    )}
                    <Button
                      leftSection={<IconUpload size={16} />}
                      color="blue"
                      onClick={handleUploadButtonClick}
                    >
                      上传文档
                    </Button>
                  </Group>
                </Group>

                <Paper withBorder radius="md" shadow="sm">
                  <Table verticalSpacing="lg" striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th style={{ width: 40 }}>
                          <Checkbox
                            checked={
                              selectedDocIds.size === documents.length && documents.length > 0
                            }
                            indeterminate={
                              selectedDocIds.size > 0 && selectedDocIds.size < documents.length
                            }
                            onChange={(e) => {
                              if (e.currentTarget.checked) {
                                setSelectedDocIds(new Set(documents.map((d) => d.document_id)));
                              } else {
                                setSelectedDocIds(new Set());
                              }
                            }}
                          />
                        </Table.Th>
                        <Table.Th>文档名称</Table.Th>
                        <Table.Th>状态</Table.Th>
                        <Table.Th>切片数</Table.Th>
                        <Table.Th>大小</Table.Th>
                        <Table.Th>上传时间</Table.Th>
                        <Table.Th style={{ width: 80 }}>操作</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {documentsLoading ? (
                        <Table.Tr>
                          <Table.Td colSpan={7}>
                            <Center py="xl">
                              <Loader size="sm" />
                            </Center>
                          </Table.Td>
                        </Table.Tr>
                      ) : documents.length > 0 ? (
                        documents.map((doc) => (
                          <Table.Tr key={doc.document_id}>
                            <Table.Td>
                              <Checkbox
                                checked={selectedDocIds.has(doc.document_id)}
                                onChange={() => {
                                  const newSet = new Set(selectedDocIds);
                                  if (newSet.has(doc.document_id)) {
                                    newSet.delete(doc.document_id);
                                  } else {
                                    newSet.add(doc.document_id);
                                  }
                                  setSelectedDocIds(newSet);
                                }}
                              />
                            </Table.Td>
                            <Table.Td>
                              <Group gap="sm" wrap="nowrap">
                                <IconFileText size={20} color="var(--mantine-color-red-5)" />
                                <Text
                                  size="sm"
                                  fw={500}
                                  truncate
                                  style={{ maxWidth: 300 }}
                                  title={doc.name}
                                >
                                  {doc.name}
                                </Text>
                              </Group>
                            </Table.Td>
                            <Table.Td>
                              <Group gap="xs">
                                <Badge
                                  color={DocumentStatusMap[doc.status]?.color || "gray"}
                                  variant="light"
                                  size="sm"
                                >
                                  {DocumentStatusMap[doc.status]?.label || "未知"}
                                </Badge>
                                {doc.status === 9 && doc.status_descript && (
                                  <Tooltip label={doc.status_descript}>
                                    <IconExclamationCircle
                                      size={14}
                                      color="red"
                                      style={{ cursor: "pointer" }}
                                    />
                                  </Tooltip>
                                )}
                              </Group>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" c="dimmed">
                                {doc.slice_count || 0}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" c="dimmed">
                                {formatFileSize(doc.size)}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" c="dimmed">
                                {formatDate(doc.create_time)}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Group gap="xs">
                                <ActionIcon
                                  variant="subtle"
                                  color="blue"
                                  size="sm"
                                  onClick={() => handleEditDoc(doc.document_id, doc.name)}
                                  title="重命名"
                                >
                                  <IconEdit size={14} />
                                </ActionIcon>
                                <ActionIcon
                                  variant="subtle"
                                  color="red"
                                  size="sm"
                                  onClick={() => openDeleteDocConfirm(doc.document_id, doc.name)}
                                  disabled={doc.status === 0}
                                  title="删除"
                                >
                                  <IconTrash size={14} />
                                </ActionIcon>
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        ))
                      ) : (
                        <Table.Tr>
                          <Table.Td colSpan={7}>
                            <Text c="dimmed" ta="center" py="xl">
                              知识库为空，快上传第一份文档吧！
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Table.Tbody>
                  </Table>
                  {/* 文档分页 */}
                  {documentsTotal > 10 && (
                    <Group justify="center" py="sm">
                      <Pagination
                        total={Math.ceil(documentsTotal / documentPageSize)}
                        value={documentPage + 1}
                        onChange={(v) => setDocumentPage(v - 1)}
                        size="sm"
                      />
                    </Group>
                  )}
                </Paper>

                {/* 上传进度面板 */}
                {showUploadPanel && uploadState.tasks.length > 0 && (
                  <UploadProgressPanel
                    queueState={uploadState}
                    onPause={() => uploadQueue.pause()}
                    onResume={() =>
                      selectedDataset && uploadQueue.resume(selectedDataset.dataset_id)
                    }
                    onCancel={() => {
                      uploadQueue.cancel();
                      setShowUploadPanel(false);
                    }}
                    onRetryFailed={() =>
                      selectedDataset && uploadQueue.retryFailed(selectedDataset.dataset_id)
                    }
                    onRetrySingle={(taskId) =>
                      selectedDataset && uploadQueue.retrySingle(taskId, selectedDataset.dataset_id)
                    }
                    onRemoveTask={(taskId) => {
                      uploadQueue.removeTask(taskId);
                      setUploadState(uploadQueue.getState());
                    }}
                    onClearFinished={() => {
                      uploadQueue.clearFinished();
                      setUploadState(uploadQueue.getState());
                    }}
                  />
                )}
              </>
            ) : (
              <Center py="xl">
                <Text c="dimmed">请从左侧选择一个知识库</Text>
              </Center>
            )}
          </Stack>
        </Group>
      )}

      {/* 创建数据集弹窗 */}
      <Modal opened={createModalOpened} onClose={closeCreateModal} title="新建知识库" centered>
        <Stack gap="md">
          <TextInput
            label="知识库名称"
            placeholder="请输入知识库名称"
            value={newDatasetName}
            onChange={(e) => setNewDatasetName(e.target.value)}
            required
          />
          <TextInput
            label="描述（可选）"
            placeholder="请输入知识库描述"
            value={newDatasetDesc}
            onChange={(e) => setNewDatasetDesc(e.target.value)}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={closeCreateModal}>
              取消
            </Button>
            <Button onClick={handleCreateDataset} loading={isCreating}>
              创建
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* 删除确认弹窗 */}
      <Modal
        opened={deleteDialogOpened}
        onClose={closeDeleteDialog}
        title="确认删除"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text>确定要删除知识库「{deleteTarget?.name}」吗？</Text>
          <Text size="sm" c="dimmed">
            删除知识库将同时删除其中的所有文档，此操作不可恢复。
          </Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeDeleteDialog}>
              取消
            </Button>
            <Button color="red" onClick={confirmDelete}>
              删除
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* 删除文档弹窗 */}
      <Modal
        opened={deleteDocDialogOpened}
        onClose={closeDeleteDocDialog}
        title="确认删除文档"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text>确定要删除文档「{deleteDocTarget?.name}」吗？</Text>
          <Text size="sm" c="dimmed">
            删除后，文档的切片信息将无法恢复。
          </Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeDeleteDocDialog}>
              取消
            </Button>
            <Button color="red" onClick={confirmDeleteDoc}>
              删除
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* 批量删除文档弹窗 */}
      <Modal
        opened={batchDeleteDialogOpened}
        onClose={closeBatchDeleteDialog}
        title="确认批量删除文档"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text>确定要删除选中的 {selectedDocIds.size} 个文档吗？</Text>
          <Text size="sm" c="dimmed">
            删除后，文档的切片信息将无法恢复。
          </Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeBatchDeleteDialog}>
              取消
            </Button>
            <Button color="red" onClick={confirmBatchDeleteDocs}>
              删除
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* 编辑文档弹窗 */}
      <Modal
        opened={editDocDialogOpened}
        onClose={closeEditDocDialog}
        title="重命名文档"
        centered
        size="sm"
      >
        <Stack gap="md">
          <TextInput
            label="文档名称"
            placeholder="请输入新的文档名称"
            value={editDocName}
            onChange={(e) => setEditDocName(e.target.value)}
            required
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeEditDocDialog}>
              取消
            </Button>
            <Button onClick={confirmEditDoc} disabled={!editDocName.trim()}>
              保存
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};

export default KnowledgeBasePage;
