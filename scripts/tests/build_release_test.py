import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location("build_release", Path(__file__).parents[1] / "build-release.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class BuildReserveTests(unittest.TestCase):
    def test_low_disk_refuses_before_starting_docker(self):
        with patch.object(build.shutil, "disk_usage", return_value=Mock(free=build.GIB)), patch.object(build.subprocess, "Popen") as spawn:
            with self.assertRaisesRegex(RuntimeError, "Insufficient disk"):
                build.guarded_build(["docker", "build"], "/")
            spawn.assert_not_called()

    def test_crossing_reserve_cancels_own_build(self):
        process = Mock(pid=1234)
        process.poll.side_effect = [None, None]
        with patch.object(build.shutil, "disk_usage", side_effect=[Mock(free=10 * build.GIB), Mock(free=build.GIB)]), patch.object(build.subprocess, "Popen", return_value=process), patch.object(build.os, "killpg", create=True) as kill:
            with self.assertRaisesRegex(RuntimeError, "Insufficient disk"):
                build.guarded_build(["docker", "build"], "/")
            kill.assert_called_once_with(1234, build.signal.SIGINT)
            process.wait.assert_called_once()


if __name__ == "__main__":
    unittest.main()
