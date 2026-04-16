# 基于Web UI模拟的上传流程

1. 上传文件：利用`/api/bot/upload_file`获得一个响应，以下是对该响应的举例
    * biz_type
        0 BIZ_UNKNOWN 未知
        1 BIZ_BOT_ICON Bot头像/图标
        2 BIZ_BOT_DATASET 知识库文档
        3 BIZ_DATASET_ICON 知识库图标

    ```json
    {
        "code": 0,
        "msg": "",
        "data": {
            "upload_url": "http://ai.yuecin.com:40010/local_storage/opencoze/BIZ_BOT_DATASET/7626374491114831872_1776232142810543736_t0X3hxDNTy.docx?X-Amz-Algorithm=AWS4-HMAC-SHA256\u0026X-Amz-Credential=minioadmin%2F20260415%2Fus-east-1%2Fs3%2Faws4_request\u0026X-Amz-Date=20260415T054902Z\u0026X-Amz-Expires=604800\u0026X-Amz-SignedHeaders=host\u0026X-Amz-Signature=1b2e76802fa002c0314313a5f983ee1ae1ec260ca3954b8dd10e508958ee87e8",
            "upload_uri": "BIZ_BOT_DATASET/7626374491114831872_1776232142810543736_t0X3hxDNTy.docx"
        }
    }
    ```

2. 创建审查：`api/knowledge/review/create`，以下是响应举例

    ```json
    {
        "dataset_id": "7628204297351593984",
        "reviews": [
            {
                "review_id": "7628859039975211008",
                "document_name": "test_docx.docx",
                "document_type": "docx",
                "tos_url": "http://ai.yuecin.com:40010/local_storage/opencoze/BIZ_BOT_DATASET/7626374491114831872_1776232142810543736_t0X3hxDNTy.docx?X-Amz-Algorithm=AWS4-HMAC-SHA256\u0026X-Amz-Credential=minioadmin%2F20260415%2Fus-east-1%2Fs3%2Faws4_request\u0026X-Amz-Date=20260415T054920Z\u0026X-Amz-Expires=604800\u0026X-Amz-SignedHeaders=host\u0026X-Amz-Signature=2bafc2dc29171bb5ef71cf3f4d6c3617236298e31bf5c1f35b8997b8fecc2517"
            }
        ],
        "code": 0,
        "msg": "",
        "BaseResp": null
    }
    ```

3. 获取文档分片预览：`/api/knowledge/review/mget`，以下是响应举例

    **重要**：返回的 `status` 字段表示文档处理状态：
    - `status: 0` - 文档还在处理中，此时 `doc_tree_tos_url` 为空，需要轮询等待
    - `status: 1` - 处理完成，`doc_tree_tos_url` 可用

    **实现注意**：由于文档处理是异步的，调用 `mget` 后如果 `status === 0`，需要轮询重试直到 `status === 1` 或超时（建议最多10次，每次间隔2秒）

    ```json
    // 这是上传docx的响应
    {
        "dataset_id": "7628204297351593984",
        "reviews": [
            {
                "review_id": "7628859039975211008",
                "document_name": "test_docx.docx",
                "document_type": "docx",
                "tos_url": "http://minio:9000/opencoze/BIZ_BOT_DATASET/7626374491114831872_1776232142810543736_t0X3hxDNTy.docx?X-Amz-Algorithm=AWS4-HMAC-SHA256\u0026X-Amz-Credential=minioadmin%2F20260415%2Fus-east-1%2Fs3%2Faws4_request\u0026X-Amz-Date=20260415T054920Z\u0026X-Amz-Expires=21600\u0026X-Amz-SignedHeaders=host\u0026X-Amz-Signature=d2f620f42fda56367560fc477d33cfbc1d372683873a14c4c55f9f4290c6eee3",
                "status": 1,
                "doc_tree_tos_url": "http://minio:9000/opencoze/DocReview/7626374491114831872_1776232160843_7628859039975211008.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256\u0026X-Amz-Credential=minioadmin%2F20260415%2Fus-east-1%2Fs3%2Faws4_request\u0026X-Amz-Date=20260415T054920Z\u0026X-Amz-Expires=21600\u0026X-Amz-SignedHeaders=host\u0026X-Amz-Signature=777c144acacb5d00ee7bc99c5efaed1be8f2a753b017235e401904c42971bfac",
                "preview_tos_url": "http://ai.yuecin.com:40010/local_storage/opencoze/BIZ_BOT_DATASET/7626374491114831872_1776232142810543736_t0X3hxDNTy.docx?X-Amz-Algorithm=AWS4-HMAC-SHA256\u0026X-Amz-Credential=minioadmin%2F20260415%2Fus-east-1%2Fs3%2Faws4_request\u0026X-Amz-Date=20260415T054920Z\u0026X-Amz-Expires=21600\u0026X-Amz-SignedHeaders=host\u0026X-Amz-Signature=d2f620f42fda56367560fc477d33cfbc1d372683873a14c4c55f9f4290c6eee3"
            }
        ],
        "code": 0,
        "msg": "",
        "BaseResp": null
    }
    // 注意是status为1才会有doc_tree_tos_url

    // 这是上传pdf的响应
    {
        "BaseResp": null,
        "code": 0,
        "dataset_id": "7628204297351593984",
        "msg": "",
        "reviews": [
            {
                "doc_tree_tos_url": "http://minio:9000/opencoze/DocReview/7626374491114831872_1776240715431_7628859039975211008.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=minioadmin%2F20260415%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260415T084118Z&X-Amz-Expires=21600&X-Amz-SignedHeaders=host&X-Amz-Signature=e6d294dcbe477116e03e0be7df60052065e7e020c3262e462d915d179cceb2c5",
                "document_name": "test_docx.docx",
                "document_type": "docx",
                "preview_tos_url": "http://minio:9000/opencoze/BIZ_BOT_DATASET/7626374491114831872_1776232142810543736_t0X3hxDNTy.docx?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=minioadmin%2F20260415%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260415T084118Z&X-Amz-Expires=21600&X-Amz-SignedHeaders=host&X-Amz-Signature=eb1d12ef893af8b1e7964207fd70f32635a2957a1d74fcee128559bfd9a16089",
                "review_id": "7628859039975211008",
                "status": 1,
                "tos_url": "http://minio:9000/opencoze/BIZ_BOT_DATASET/7626374491114831872_1776232142810543736_t0X3hxDNTy.docx?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=minioadmin%2F20260415%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260415T084118Z&X-Amz-Expires=21600&X-Amz-SignedHeaders=host&X-Amz-Signature=eb1d12ef893af8b1e7964207fd70f32635a2957a1d74fcee128559bfd9a16089"
            }
        ]
    }
    ```

4. 获取chunk：将"doc_tree_tos_url"的域名+端口改为“http://ai.yuecin.com:40010/local_storage/”后续内容拼接，即可获取chunks，以下是响应举例

    ```URL
    // 最终URL参考
    http://ai.yuecin.com:40010/local_storage/opencoze/DocReview/7626374491114831872_1776253185633_7628949340664365056.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=minioadmin%2F20260415%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260415T113952Z&X-Amz-Expires=21600&X-Amz-SignedHeaders=host&X-Amz-Signature=8a74c1b8384777fbef5c19b05d336c27087ff34bd7b0535f940d2486896d51dc
    ```

    ```json
    // 响应举例
    {"chunks":[{"id":"7628859040814071808","text":"This is a docx file for testing the upload and knowledge API","type":"text"},{"id":"7628859040814088192","text":"Extra Page test for redundancy","type":"text"}]}
    ```

5. 保存chunk：`/api/knowledge/review/save`，以下是请求格式（需要传 dataset_id）

    ```json
    {
        "dataset_id": "7628204297351593984",
        "review_id": "7628949340664365056",
        "doc_tree_json": "{\"chunks\":[{\"id\":\"7628949341645832192\",\"text\":\"This is a docx file for testing the upload and knowledge API\",\"type\":\"text\"},{\"id\":\"7628949341645848576\",\"text\":\"Extra Page test for redundancy\",\"type\":\"text\"}]}"
    }
    ```

    响应：
    ```json
    {"code":0,"data":null,"msg":"success"}
    ```

6. 创建knowledge文档：`/api/knowledge/document/create`，请求格式如下

    ```json
    {
        "dataset_id": "7628204297351593984",
        "format_type": 0,
        "document_bases": [
            {
                "name": "test_docx.pdf",
                "source_info": {
                    "tos_uri": "BIZ_BOT_DATASET/7626374491114831872_1776253177465757316_rSvHimv5r2.pdf",
                    "document_source": 0,
                    "review_id": "7628949340664365056"
                }
            }
        ],
        "chunk_strategy": {
            "chunk_type": 0
        },
        "parsing_strategy": {
            "parsing_type": 0,
            "image_extraction": true,
            "table_extraction": true,
            "image_ocr": false
        }
    }
    ```

    响应举例：

    ```json
    {
        "document_infos": [
            {
                "name": "test_text.txt",
                "document_id": "7628954759684161536",
                "tos_uri": "BIZ_BOT_DATASET/7626374491114831872_1776254440102382663_XPTI7CWo9u.txt",
                "create_time": 0,
                "update_time": 0,
                "creator_id": "7626374491114831872",
                "slice_count": 0,
                "type": "txt",
                "size": 0,
                "char_count": 0,
                "status": 0,
                "hit_count": 0,
                "source_type": 0,
                "format_type": 0,
                "web_url": "",
                "status_descript": "",
                "space_id": "7626374491127414784",
                "chunk_strategy": {
                    "separator": "\n",
                    "max_tokens": 800,
                    "remove_extra_spaces": false,
                    "remove_urls_emails": false,
                    "chunk_type": 0,
                    "overlap": 10,
                    "max_level": 0,
                    "save_title": false
                },
                "parsing_strategy": {
                    "parsing_type": 0,
                    "image_extraction": false,
                    "table_extraction": false,
                    "image_ocr": false
                },
                "preview_tos_url": ""
            }
        ],
        "code": 0,
        "msg": "",
        "BaseResp": null
    }
    ```

8. 获取知识库列表：`/api/knowledge/document/list`，以下是响应举例

    ```json
    {
        "dataset_details": {
            "7628204297351593984": {
                "dataset_id": "7628204297351593984",
                "name": "test_dataset",
                "file_list": [
                    "202511数据资产政策汇编-兴安盟行政审批政务服务与数据管理局.pdf",
                    "20260214《黑龙江省深入实施“人工智能+”行动的实施方案》.pdf",
                    "20260214《黑龙江省深入实施“人工智能+”行动的实施方案》.pdf",
                    "20260215《黑龙江省“人工智能＋”政务深化应用工作方案》.pdf",
                    "test_docx.docx"
                ],
                "all_file_size": "56802",
                "bot_used_count": 0,
                "status": 1,
                "processing_file_list": null,
                "update_time": 1776232177,
                "icon_url": "http://ai.yuecin.com:40010/local_storage/opencoze/default_icon/text_kn_default_icon.png?X-Amz-Algorithm=AWS4-HMAC-SHA256\u0026X-Amz-Credential=minioadmin%2F20260415%2Fus-east-1%2Fs3%2Faws4_request\u0026X-Amz-Date=20260415T055058Z\u0026X-Amz-Expires=604800\u0026X-Amz-SignedHeaders=host\u0026X-Amz-Signature=e6086299ca5e192b117f76d1b7c22c097bcab54c17c2ce0a1e5d8db4d64761b1",
                "description": "测试数据集",
                "icon_uri": "default_icon/text_kn_default_icon.png",
                "can_edit": true,
                "create_time": 1776079716,
                "creator_id": "7626374491114831872",
                "space_id": "7626374491127414784",
                "failed_file_list": null,
                "format_type": 0,
                "slice_count": 1087,
                "hit_count": 0,
                "doc_count": 5,
                "chunk_strategy": {
                    "separator": "\n",
                    "max_tokens": 800,
                    "remove_extra_spaces": false,
                    "remove_urls_emails": false,
                    "chunk_type": 0,
                    "overlap": 10,
                    "max_level": 0,
                    "save_title": false
                },
                "processing_file_id_list": null,
                "project_id": "0"
            }
        },
        "code": 0,
        "msg": ""
    }
    ```

