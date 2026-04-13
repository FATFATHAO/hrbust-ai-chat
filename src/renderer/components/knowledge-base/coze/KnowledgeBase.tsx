import {
  ActionIcon,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Modal,
  Pagination,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconArrowLeft,
  IconBookUpload,
  IconFileText,
  IconFolderPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "@tanstack/react-router";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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

// ========== API 配置 ==========

// @ts-ignore
const API_BASE_URL =
  window.APP_CONFIG?.API_BASE_URL || import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:48080";

// ========== API 函数 ==========

const cozeApi = {
  // 上传文件到 Coze
  async uploadFile(file: File): Promise<{ file_id: string; file_name: string }> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_BASE_URL}/v1/files/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`上传失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.file_info || data;
  },

  // 创建文档
  async createDocument(datasetId: string, fileId: string, fileName: string): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/v1/open_api/knowledge/document/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset_id: datasetId,
        document_bases: [
          {
            name: fileName,
            source_info: {
              source_file_id: fileId,
              document_source: "upload",
            },
          },
        ],
        storage_strategy: {
          storage_location: "coze",
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`创建文档失败: ${response.statusText}`);
    }

    const data: CreateDocumentResponse = await response.json();
    if (data.code !== 0) {
      throw new Error(data.msg || "创建文档失败");
    }

    return data.document_infos?.[0]?.document_id || "";
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
      page: String(page),
      size: String(size),
      space_id: "7626374491127414784",
      project_id: "7626374607464824832",
      knowledge_ids: "7626400579832512512",
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
    const response = await fetch(`${API_BASE_URL}/v1/open_api/knowledge/document/delete`, {
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
    if (data.code !== 0) {
      throw new Error(data.msg || "删除文档失败");
    }
  },
};

// ========== 组件 ==========

const KnowledgeBasePage: React.FC = () => {
  const router = useRouter();

  // 状态
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [datasetPage, setDatasetPage] = useState(1);
  const [totalDatasets, setTotalDatasets] = useState(0);

  // 上传
  const [isUploading, setIsUploading] = useState(false);
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

  // 选择数据集时，直接从 selectedDataset.file_list 获取文档列表
  const fileList = selectedDataset?.file_list || [];

  // 处理文件上传
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    event.target.value = "";

    if (!selectedDataset) {
      toast.error("请先选择一个知识库");
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading("正在上传并送往大模型大脑...");

    try {
      // 1. 上传文件到 Coze
      const fileInfo = await cozeApi.uploadFile(file);

      // 2. 创建文档记录
      await cozeApi.createDocument(selectedDataset.dataset_id, fileInfo.file_id, file.name);

      toast.success("上传成功，大模型正在阅读切片！", { id: toastId });

      // 刷新数据集列表以更新 file_list
      await fetchDatasets();
    } catch (error: any) {
      console.error("上传错误:", error);
      toast.error(`上传失败: ${error.message}`, { id: toastId });
    } finally {
      setIsUploading(false);
    }
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

  // 总页数
  const totalDatasetPages = Math.ceil(totalDatasets / 20) || 1;

  // ========== 渲染 ==========

  return (
    <Stack p="md" gap="xl" h="100%" style={{ overflowY: "auto" }}>
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
              专属知识库 (Coze RAG)
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
          <Paper withBorder radius="md" shadow="sm" style={{ width: 320, flexShrink: 0 }}>
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
                      onClick={() => setSelectedDataset(ds)}
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
                      style={{ display: "none" }}
                      ref={fileInputRef}
                      onChange={handleFileChange}
                    />
                    {/* <Button */}
                    {/*   leftSection={<IconBookUpload size={16} />} */}
                    {/*   color="blue" */}
                    {/*   onClick={() => fileInputRef.current?.click()} */}
                    {/*   loading={isUploading} */}
                    {/* > */}
                    {/*   {isUploading ? '上传中...' : '上传文档'} */}
                    {/* </Button> */}
                  </Group>
                </Group>

                <Paper withBorder radius="md" shadow="sm">
                  <Table verticalSpacing="sm" striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>文档名称</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {fileList.length > 0 ? (
                        fileList.map((fileName, index) => (
                          <Table.Tr key={index}>
                            <Table.Td>
                              <Group gap="sm" wrap="nowrap">
                                <IconFileText size={20} color="var(--mantine-color-red-5)" />
                                <Text
                                  size="sm"
                                  fw={500}
                                  truncate
                                  style={{ maxWidth: 500 }}
                                  title={fileName}
                                >
                                  {fileName}
                                </Text>
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        ))
                      ) : (
                        <Table.Tr>
                          <Table.Td>
                            <Text c="dimmed" ta="center" py="xl">
                              知识库为空，快上传第一份文档吧！
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Table.Tbody>
                  </Table>
                </Paper>
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
    </Stack>
  );
};

export default KnowledgeBasePage;
