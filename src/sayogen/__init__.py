import pathlib
import click

from sayogen.backend.server import start_server
from sayogen.backend.dataset import Dataset

# The root command.
@click.command("serve")
@click.argument("path", type=click.Path(True, dir_okay=False))
@click.option("-p", "--port", type=click.INT, default=8080)
def root_command(port: int, path: str): 
    start_server(Dataset(pathlib.Path(path)), port)
