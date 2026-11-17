from starlette.responses import Response, FileResponse, StreamingResponse, JSONResponse, PlainTextResponse 
#from transformers import Sam2Processor, Sam2Model
from starlette.staticfiles import StaticFiles
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.routing import Mount
from PIL import Image
import pathlib
import uvicorn
#import torch
#import numpy
import io

from sayogen.backend.dataset import Dataset

# Start a dataset editor server.
def start_server(dataset: Dataset, port: int) -> None:
    static_directory = (pathlib.Path(__file__) / "../../frontend/static").resolve()

    app = Starlette(False, [
         Mount('/assets', app=StaticFiles(directory=(static_directory / "assets")), name="assets")
    ])

#    inference_device = "cuda" if torch.cuda.is_available() else "cpu"
#
#    sam2_model = Sam2Model.from_pretrained("facebook/sam2-hiera-large").to(inference_device)
#    sam2_processor = Sam2Processor.from_pretrained("facebook/sam2-hiera-large")

    @app.route("/")
    async def index_html(_: Request) -> Response:
        return FileResponse(static_directory / ("index.html"))

    @app.route("/api/summary")
    async def summary_api(_: Request) -> Response:
        return JSONResponse({
            "classes": dataset.class_list,

            "train_partition_size": len(dataset.train_partition.entry_list),
            "validation_partition_size": len(dataset.validation_partition.entry_list)
        })

    @app.route("/api/list")
    async def list_api(request: Request) -> Response:
        partition = request.query_params.get("partition")

        if partition is None:
            return PlainTextResponse("Mising Partition", 400)

        class_id = None

        if "class_id" in request.query_params:
            try:
                class_id = int(request.query_params["class_id"])
            except:
                return PlainTextResponse("Invalid Class ID", 400)

        page_index = 0

        if "page" in request.query_params:
            try:
                page_index = int(request.query_params["page"]) - 1

                if page_index < 0:
                    return PlainTextResponse("Invalid Page Number", 400)
            except:
                return PlainTextResponse("Invalid Page Number", 400)

        if partition == "train":
            return JSONResponse(dataset.train_partition.search(class_id, page_index, 50))
        if partition == "validation":
            return JSONResponse(dataset.validation_partition.search(class_id, page_index, 50))

        return PlainTextResponse("Invalid Partition", 400)

    @app.route("/api/remove", methods=["DELETE"])
    async def remove_api(request: Request) -> Response:
        partition = request.query_params.get("partition")

        if partition is None:
            return PlainTextResponse("Mising Partition", 400)

        if "entry_id" not in request.query_params:
            return PlainTextResponse("Missing Entry ID", 400)

        if partition == "train":
            if dataset.train_partition.remove(request.query_params["entry_id"]):
                return PlainTextResponse("Successfully Removed", 200)

            return PlainTextResponse("Entry Not Found", 404)
        elif partition == "validation":
            if dataset.validation_partition.remove(request.query_params["entry_id"]):
                return PlainTextResponse("Successfully Removed", 200)

            return PlainTextResponse("Entry Not Found", 404)

        return PlainTextResponse("Invalid Partition", 400)

    @app.route("/resources/preview")
    async def preview_resource(request: Request) -> Response:
        partition = request.query_params.get("partition")

        if partition is None:
            return PlainTextResponse("Mising Partition", 400)

        if "entry_id" not in request.query_params:
            return PlainTextResponse("Missing Entry ID", 400)

        if partition == "train":
            result = dataset.train_partition.render(request.query_params["entry_id"])

            if result is None:
                return PlainTextResponse("Image Not Found", 404)

            return StreamingResponse(result, media_type="image/jpeg")        
        elif partition == "validation":
            result = dataset.validation_partition.render(request.query_params["entry_id"])

            if result is None:
                return PlainTextResponse("Image Not Found", 404)

            return StreamingResponse(result, media_type="image/jpeg")

        return PlainTextResponse("Invalid Partition", 400)

    @app.route("/inference/sam2", methods=["POST"])
    async def sam2_inference(request: Request) -> Response:
        points = []

        if "points" in request.query_params:
            try:
                for point_part in request.query_params["points"].split(","):
                    separator_index = point_part.index(":")

                    points.append([int(point_part[:separator_index]), int(point_part[separator_index + 1:])])
            except:
                return PlainTextResponse("Invalid Points", 400)
        else:
            return PlainTextResponse("Missing Points", 400)

        request_body = await request.body()

        if not request_body:
            return PlainTextResponse("Mising Input Image", 400)

        inputs = sam2_processor(
            images=Image.open(io.BytesIO(request_body)).convert("RGB"), 
            input_points=[[points]], 
            input_labels=[[[1] * len(points)]], 
            return_tensors="pt"
        ).to(inference_device)

        with torch.no_grad():
            outputs = sam2_model(**inputs)

        masks = sam2_processor.post_process_masks(
            outputs.pred_masks.cpu(),
            inputs["original_sizes"].cpu()
        )[0]

        best_mask_index = outputs.iou_scores.argmax().item() 

        mask_array = (masks[0][best_mask_index] > 0.0).numpy().astype(numpy.uint8) * 255
        mask_image = Image.fromarray(mask_array, mode="L")
        rgba_image = Image.new("RGBA", mask_image.size, (0, 0, 0, 0))

        image_io = io.BytesIO()

        rgba_image.paste((255, 255, 255), mask=mask_image)
        rgba_image.save(image_io, format="PNG")

        image_io.seek(0)

        return Response(image_io.getvalue(), media_type="image/png")

    uvicorn.run(app, host="0.0.0.0", port=port)
