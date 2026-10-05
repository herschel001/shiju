#!/usr/bin/python3
"""Run a saved screenshot naming job outside the short-lived native message host."""

import sys
import time

from host import read_job, run_organize_job


if __name__ == '__main__':
    for _ in range(50):
        if read_job(sys.argv[1]).get('pid'):
            break
        time.sleep(0.1)
    run_organize_job(sys.argv[1], sys.argv[2])
