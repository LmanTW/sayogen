import pathlib
import typing
import yaml
import cv2
import io

SUPPORTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"]

# A partition
class Partition:

    # Initialize a partition.
    def __init__(self, image_directory: pathlib.Path, label_directory: pathlib.Path, class_table: dict[int, str]) -> None:
        self.image_directory = image_directory
        self.label_directory = label_directory

        self.entry_list = []
        self.entry_table = {}

        self.class_table = class_table

        for image_path in image_directory.iterdir():
            if image_path.stem[0] == "." or image_path.suffix not in SUPPORTED_EXTENSIONS:
                continue

            label_path = label_directory / (image_path.stem + ".txt")
            label_list = []
            class_list = []

            if label_path.exists():
                with label_path.open("r") as label_file:
                    for line_number, line_content in enumerate(label_file, start=1):
                        parts = line_content.strip().split(" ")

                        if len(parts) != 5:
                            raise Exception(f"Invalid label definition on line {line_number} in {label_path}")

                        class_id = None
                        label_center_x = None
                        label_center_y = None
                        label_width = None
                        label_height = None

                        try:
                            class_id = int(parts[0])
                        except:
                            raise Exception(f"Label with invalid class ID on line {line_number} in {label_path}")

                        try:
                            label_center_x = float(parts[1])
                        except:
                            raise Exception(f"Label with invalid center X on line {line_number} in {label_path}")

                        try:
                            label_center_y = float(parts[2])
                        except:
                            raise Exception(f"Label with invalid center Y on line {line_number} in {label_path}")

                        try:
                            label_width = float(parts[3])
                        except:
                            raise Exception(f"Label with invalid width on line {line_number} in {label_path}")

                        try:
                            label_height = float(parts[4])
                        except:
                            raise Exception(f"Label with invalid height on line {line_number} in {label_path}")

                        if class_id not in class_table:
                            raise Exception(f"Label label with unknown class ID on line {line_number} in {label_path}")

                        label_list.append({
                            "class_id": class_id,
                            "center_x": label_center_x,
                            "center_y": label_center_y,
                            "width": label_width,
                            "height": label_height
                        })

                        if class_id not in class_list:
                            class_list.append(class_id)

            self.entry_table[image_path.stem] = {
                "image_path": image_path,
                "label_path": label_path,

                "label_list": label_list,
                "class_list": class_list
            }

            self.entry_list.append(image_path.stem)

        self.entry_list = sorted(self.entry_list)

    # Search for entries in the partition with paging.
    def search(self, class_id: typing.Union[None, int], page_index: int, page_size: int) -> dict:
        page_entries = []

        start_index = page_index * page_size
        end_index = start_index + page_size

        if class_id is None:
            for index, entry_id in enumerate(self.entry_list[start_index:]):
                if index >= end_index:
                    break

                page_entries.append({
                    "id": entry_id,
                    "labels": self.entry_table[entry_id]["label_list"]
                })

            return {
                "entries": page_entries,
                "current_page": page_index + 1,
                "total_results": len(self.entry_list)
            }

        total_results = 0

        for index, entry_id in enumerate(self.entry_list):
            entry_data = self.entry_table[entry_id]

            if class_id in entry_data["class_list"]:
                total_results += 1

                if index >= start_index and index < end_index :
                    page_entries.append({
                        "id": entry_id,
                        "labels": self.entry_table[entry_id]["label_list"]
                    })

        return {
            "entries": page_entries,
            "current_page": page_index + 1,
            "total_results": total_results
        }

    # Render an image with labels.
    def render(self, entry_id: str) -> typing.Union[None, io.BytesIO]:
        if entry_id not in self.entry_table:
            return

        entry = self.entry_table[entry_id]
        image = cv2.imread(str(entry["image_path"]))

        if image is None:
            return

        image_width = image.shape[1]
        image_height = image.shape[0]

        for label in entry["label_list"]:
            center_x = label["center_x"] * image_width 
            center_y = label["center_y"] * image_height
            width = label["width"] * image_width
            height = label["height"] * image_height

            cv2.rectangle(
                image,
                (int(center_x - (width / 2)), int(center_y - (height / 2))),
                (int(center_x + (width / 2)), int(center_y + (height / 2))),
                (0, 255, 0),
                max(1, int((image_width + image_height) / 400))
            )

            font_size = (image_width + image_height) / 1500

            cv2.putText(
                image, 
                self.class_table[label["class_id"]], 
                (int((center_x - (width / 2)) + (font_size * 10)), int((center_y - (height / 2)) + (font_size * 30))),
                cv2.FONT_HERSHEY_SIMPLEX,
                font_size, 
                (0, 255, 0),
                max(1, int((image_width + image_height) / 400))
            )

        return io.BytesIO(cv2.imencode(".jpg", image)[1].tobytes())

    # Remove an entry from the partition.
    def remove(self, entry_id: str) -> bool:
        if entry_id not in self.entry_table:
            return False

        self.entry_table[entry_id]["image_path"].unlink()
        self.entry_table[entry_id]["label_path"].unlink()

        self.entry_list.remove(entry_id)

        del self.entry_table[entry_id]

        return True

# A dataset.
class Dataset:

    # Initialize a dataset.
    def __init__(self, metadata_path: pathlib.Path) -> None:
        with metadata_path.open("r") as metadata_file:
            parsed_metadata = yaml.load(metadata_file, Loader=yaml.FullLoader)

        self.class_list = []
        self.class_table = {}

        for class_id, class_name in parsed_metadata["names"].items():
            try:
                self.class_list.append({ "id": int(class_id), "name": class_name })
                self.class_table[int(class_id)] = class_name
            except:
                raise Exception(f"Invalid class ID of \"{class_id}\" in {metadata_path}")

        self.class_list = sorted(self.class_list, key=lambda x: x["name"])

        train_image_directory = (metadata_path.resolve().parent / parsed_metadata["path"] / parsed_metadata["train"]).resolve()
        val_image_directory = (metadata_path.resolve().parent / parsed_metadata["path"] / parsed_metadata["val"]).resolve()

        self.train_partition = Partition(train_image_directory, pathlib.Path(*train_image_directory.parts[:-2], "labels", train_image_directory.parts[-1]), self.class_table)
        self.validation_partition = Partition(val_image_directory, pathlib.Path(*val_image_directory.parts[:-2], "labels", val_image_directory.parts[-1]), self.class_table)
