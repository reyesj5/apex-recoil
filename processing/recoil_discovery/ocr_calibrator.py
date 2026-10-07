"""
Automated angle extraction and calibration from in-game HUD (+cl_showpos 1).
Extracts pitch and yaw viewangles, computes angular distance in Source engine mouse units,
and scales pixel coordinates to canonical game distance.
"""

import re
from typing import Tuple, Optional
import numpy as np
import cv2

from .math_utils import angular_pixel_distance


class AngleCalibrator:
    """
    Extracts angle coordinates from +cl_showpos 1 HUD text and computes scaling factors.
    """

    # Regex matching "ang: -13.95 134.77 0.00" or "ang: -13.95, 134.77"
    ANG_REGEX = re.compile(r"ang[:\s]+([-\d.]+)[,\s]+([-\d.]+)")

    def __init__(self, use_ocr: bool = True):
        self.use_ocr = use_ocr
        self.ocr_engine = None
        if use_ocr:
            self._init_ocr()

    def _init_ocr(self):
        try:
            import pytesseract
            self.ocr_engine = "pytesseract"
        except ImportError:
            try:
                import easyocr
                self.ocr_reader = easyocr.Reader(['en'], gpu=False)
                self.ocr_engine = "easyocr"
            except ImportError:
                self.ocr_engine = None

    def preprocess_hud_roi(self, roi_img: np.ndarray) -> np.ndarray:
        """
        Preprocess Source Engine bitmap HUD text for OCR readability.
        """
        if len(roi_img.shape) == 3:
            gray = cv2.cvtColor(roi_img, cv2.COLOR_BGR2GRAY)
        else:
            gray = roi_img.copy()

        # Upscale for small font readability
        h, w = gray.shape
        resized = cv2.resize(gray, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)

        # White text thresholding
        _, thresh = cv2.threshold(resized, 180, 255, cv2.THRESH_BINARY)
        return thresh

    def parse_angle_text(self, text: str) -> Optional[Tuple[float, float]]:
        """
        Extract (pitch, yaw) floats from string containing cl_showpos 1 text.
        """
        clean_text = text.replace('\n', ' ').strip()
        match = self.ANG_REGEX.search(clean_text)
        if match:
            try:
                pitch = float(match.group(1))
                yaw = float(match.group(2))
                return pitch, yaw
            except ValueError:
                return None
        return None

    def extract_angles_from_image(self, roi_img: np.ndarray) -> Optional[Tuple[float, float]]:
        """
        Run OCR on HUD region of interest and extract (pitch, yaw).
        """
        preprocessed = self.preprocess_hud_roi(roi_img)

        if self.ocr_engine == "pytesseract":
            import pytesseract
            text = pytesseract.image_to_string(
                preprocessed,
                config="--psm 6 -c tessedit_char_whitelist=ang:0123456789.- "
            )
            return self.parse_angle_text(text)
        elif self.ocr_engine == "easyocr":
            results = self.ocr_reader.readtext(preprocessed)
            full_text = " ".join([r[1] for r in results])
            return self.parse_angle_text(full_text)
        return None

    def calculate_anchor_distance(
        self,
        pitch_a: float,
        yaw_a: float,
        pitch_b: float,
        yaw_b: float
    ) -> float:
        """
        Calculate in-game distance between two anchor points using pitch/yaw.
        Equivalent to points(a, b, c, d) in processing/recoils.ipynb.
        """
        return round(angular_pixel_distance(pitch_a, yaw_a, pitch_b, yaw_b), 2)
