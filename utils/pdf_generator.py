"""
Security Assessment PDF Report Generator Method

This module provides the generate_workbook method for creating
professional PDF reports from JSON security assessment data.
"""

import json
import os
import re
from datetime import datetime
from typing import Dict, List, Any, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, 
    PageBreak, KeepTogether, Image
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from PIL import Image as PILImage
import io


def generate_workbook(json_data, evidence_docs_screenshot=None, output_filename="security_assessment_report.pdf"):
    """
    Generate a visually pleasing PDF report from JSON security assessment data.
    
    Args:
        json_data: List of dictionaries containing assessment data
        evidence_docs_screenshot: PIL Image object to be included at the end of the report (optional)
        output_filename: Name of the output PDF file
        
    Returns:
        String: File path of generated PDF on success, None on failure
    """
    try:
        generator = SecurityAssessmentReportGenerator()
        result = generator.generate_report(json_data, output_filename, evidence_docs_screenshot)
        return output_filename if result['success'] else None
    except Exception as e:
        print(f"PDF generation failed: {str(e)}")
        return None


def generate_workbook_detailed(json_data, evidence_docs_screenshot=None, output_filename="security_assessment_report.pdf"):
    """
    Generate a PDF report and return detailed results including statistics and errors.
    
    Args:
        json_data: List of dictionaries containing assessment data
        evidence_docs_screenshot: PIL Image object to be included at the end of the report (optional)
        output_filename: Name of the output PDF file
        
    Returns:
        Dictionary containing generation results, statistics, and any errors
    """
    try:
        generator = SecurityAssessmentReportGenerator()
        return generator.generate_report(json_data, output_filename, evidence_docs_screenshot)
    except Exception as e:
        return {
            'success': False,
            'error': f"PDF generation failed: {str(e)}",
            'output_file': None
        }


class SecurityAssessmentReportGenerator:
    """
    Internal class for generating professional PDF security assessment reports.
    """
    
    # Risk level color mapping for visual appeal
    RISK_COLORS = {
        'CRITICAL': colors.red,
        'HIGH': colors.orange,
        'MEDIUM': colors.yellow,
        'LOW': colors.green,
        'UNKNOWN': colors.grey
    }
    
    # Compliance status color mapping
    COMPLIANCE_COLORS = {
        'COMPLIANT': colors.green,
        'NON-COMPLIANT': colors.red,
        'PARTIALLY COMPLIANT': colors.orange,
        'NOT ASSESSED': colors.grey
    }

    def __init__(self):
        """Initialize the report generator with professional styles."""
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()
    
    def _setup_custom_styles(self):
        """Set up custom paragraph styles for risk assessment report appearance."""
        # Main title style
        self.title_style = ParagraphStyle(
            'RiskAssessmentTitle',
            parent=self.styles['Heading1'],
            fontSize=26,
            spaceAfter=30,
            alignment=TA_CENTER,
            textColor=colors.darkred,
            fontName='Helvetica-Bold'
        )
        
        # Report subtitle
        self.subtitle_style = ParagraphStyle(
            'ReportSubtitle',
            parent=self.styles['Heading2'],
            fontSize=18,
            spaceAfter=20,
            alignment=TA_CENTER,
            textColor=colors.darkblue,
            fontName='Helvetica-Bold'
        )
        
        # Section heading styles
        self.heading_style = ParagraphStyle(
            'RiskSectionHeading',
            parent=self.styles['Heading2'],
            fontSize=15,
            spaceAfter=15,
            spaceBefore=25,
            textColor=colors.darkred,
            fontName='Helvetica-Bold'
        )
        
        self.subheading_style = ParagraphStyle(
            'ControlTestHeading',
            parent=self.styles['Heading3'],
            fontSize=13,
            spaceAfter=10,
            spaceBefore=15,
            textColor=colors.darkblue,
            fontName='Helvetica-Bold',
            leftIndent=5
        )
        
        # Body text styles
        self.body_style = ParagraphStyle(
            'RiskAssessmentBody',
            parent=self.styles['Normal'],
            fontSize=11,
            spaceAfter=6,
            alignment=TA_JUSTIFY,
            fontName='Helvetica'
        )
        
        self.finding_style = ParagraphStyle(
            'FindingText',
            parent=self.styles['Normal'],
            fontSize=10,
            spaceAfter=4,
            fontName='Helvetica',
            leftIndent=15,
            bulletIndent=10
        )
        
        self.small_text_style = ParagraphStyle(
            'EvidenceText',
            parent=self.styles['Normal'],
            fontSize=9,
            spaceAfter=4,
            fontName='Helvetica',
            leftIndent=20
        )
        
        # Executive summary style
        self.executive_style = ParagraphStyle(
            'ExecutiveRiskSummary',
            parent=self.styles['Normal'],
            fontSize=12,
            spaceAfter=8,
            alignment=TA_JUSTIFY,
            leftIndent=20,
            rightIndent=20,
            fontName='Helvetica',
            backColor=colors.lightgrey,
            borderWidth=1,
            borderColor=colors.grey,
            borderPadding=10
        )
        
        # Risk rating style
        self.risk_rating_style = ParagraphStyle(
            'RiskRating',
            parent=self.styles['Normal'],
            fontSize=12,
            fontName='Helvetica-Bold',
            alignment=TA_CENTER
        )

    def _clean_json_content(self, content: str) -> str:
        """Clean and extract JSON content from markdown-wrapped strings."""
        if not isinstance(content, str):
            return str(content)
        
        # Remove markdown code block markers
        content = re.sub(r'^```json\s*', '', content, flags=re.MULTILINE)
        content = re.sub(r'```\s*$', '', content, flags=re.MULTILINE)
        return content.strip()
    
    def _has_meaningful_value(self, value) -> bool:
        """Check if a value is meaningful and should be included in the report."""
        if value is None:
            return False
        if isinstance(value, str) and (not value.strip() or value.strip().lower() in ['', 'null', 'none', 'n/a']):
            return False
        if isinstance(value, list) and len(value) == 0:
            return False
        if isinstance(value, dict) and len(value) == 0:
            return False
        return True

    def _parse_assessment_data(self, json_data: List[Dict]) -> tuple:
        """Parse and validate JSON assessment data."""
        assessments = []
        executive_summary = ""
        parsing_errors = []
        
        for i, item in enumerate(json_data):
            try:
                if 'executive_summary' in item:
                    executive_summary = item['executive_summary']
                    continue
                
                if 'assessment' in item:
                    assessment_content = item['assessment']
                    
                    # Check if it's an error message
                    if isinstance(assessment_content, str) and assessment_content.startswith('Error:'):
                        parsing_errors.append(f"Entry {i+1}: {assessment_content}")
                        continue
                    
                    # Try to parse as JSON
                    if isinstance(assessment_content, str):
                        cleaned_content = self._clean_json_content(assessment_content)
                        try:
                            assessment_obj = json.loads(cleaned_content)
                        except json.JSONDecodeError:
                            # Try to extract partial JSON if it's truncated
                            truncated_match = re.search(r'\{.*\}', cleaned_content, re.DOTALL)
                            if truncated_match:
                                try:
                                    assessment_obj = json.loads(truncated_match.group())
                                except json.JSONDecodeError:
                                    parsing_errors.append(f"Entry {i+1}: Unable to parse JSON content")
                                    continue
                            else:
                                parsing_errors.append(f"Entry {i+1}: Unable to parse JSON content")
                                continue
                    else:
                        assessment_obj = assessment_content
                    
                    # Validate required fields
                    if isinstance(assessment_obj, dict):
                        assessments.append(assessment_obj)
                    else:
                        parsing_errors.append(f"Entry {i+1}: Assessment is not a valid object")
                        
            except Exception as e:
                parsing_errors.append(f"Entry {i+1}: {str(e)}")
        
        return assessments, executive_summary, parsing_errors

    def _generate_summary_statistics(self, assessments: List[Dict]) -> Dict:
        """Generate summary statistics from assessments."""
        stats = {
            'total_assessments': len(assessments),
            'compliance_status': {},
            'risk_levels': {},
            'generation_date': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        
        for assessment in assessments:
            # Count compliance status
            result = assessment.get('assessment_result', {})
            compliance_status = result.get('Compliance_Status', 'UNKNOWN')
            stats['compliance_status'][compliance_status] = stats['compliance_status'].get(compliance_status, 0) + 1
            
            # Count risk levels
            risk_level = result.get('Risk_Level', 'UNKNOWN')
            stats['risk_levels'][risk_level] = stats['risk_levels'].get(risk_level, 0) + 1
        
        return stats

    def _create_title_page(self, story: List, stats: Dict):
        """Create the title page of the report."""
        story.append(Spacer(1, 2*inch))
        
        # Main title
        title = Paragraph("Security Assessment Report", self.title_style)
        story.append(title)
        story.append(Spacer(1, 0.5*inch))
        
        # Subtitle with statistics
        subtitle_text = f"Comprehensive Security Control Assessment<br/>Generated on {stats['generation_date']}"
        subtitle = Paragraph(subtitle_text, self.subtitle_style)
        story.append(subtitle)
        story.append(Spacer(1, 1*inch))
        
        # Summary box
        summary_data = [
            ['Total Assessments', str(stats['total_assessments'])],
            ['Generation Date', stats['generation_date']],
        ]
        
        summary_table = Table(summary_data, colWidths=[3*inch, 2*inch])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.lightgrey),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 12),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            ('BACKGROUND', (0, 0), (0, -1), colors.darkgrey),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.whitesmoke),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        
        story.append(summary_table)
        story.append(PageBreak())

    def _create_executive_summary(self, story: List, executive_summary: str):
        """Create the executive summary section."""
        story.append(Paragraph("Executive Summary", self.heading_style))
        story.append(Spacer(1, 0.2*inch))
        
        # Split summary into paragraphs and look for subheaders
        paragraphs = executive_summary.split('\n\n')
        for paragraph in paragraphs:
            paragraph = paragraph.strip()
            if not paragraph:
                continue
                
            # Check if paragraph starts with **text**: pattern (markdown-style header)
            if paragraph.startswith('**') and ':**' in paragraph:
                # Extract header text between ** markers
                header_end = paragraph.find(':**')
                if header_end > 2:
                    header_text = paragraph[2:header_end]
                    remaining_text = paragraph[header_end + 3:].strip()
                    
                    # Add the header as a subheading
                    story.append(Paragraph(header_text, self.subheading_style))
                    story.append(Spacer(1, 0.1*inch))
                    
                    # Add remaining text if any
                    if remaining_text:
                        # Process remaining text for formatting
                        formatted_text = self._format_text_markup(remaining_text)
                        story.append(Paragraph(formatted_text, self.body_style))
                        story.append(Spacer(1, 0.1*inch))
                else:
                    # Fallback if pattern doesn't match expected format
                    formatted_text = self._format_text_markup(paragraph)
                    story.append(Paragraph(formatted_text, self.body_style))
                    story.append(Spacer(1, 0.1*inch))
            else:
                # Check if this is a bullet point (starts with *)
                if paragraph.startswith('*') and not paragraph.startswith('**'):
                    # Create bullet point style
                    bullet_style = ParagraphStyle(
                        'ExecutiveBullet',
                        parent=self.body_style,
                        leftIndent=20,
                        bulletIndent=5,
                        bulletFontName='Symbol',
                        bulletText='•'
                    )
                    # Remove the * and add bullet formatting
                    bullet_text = paragraph[1:].strip()
                    formatted_text = self._format_text_markup(bullet_text)
                    story.append(Paragraph(f"• {formatted_text}", bullet_style))
                    story.append(Spacer(1, 0.05*inch))
                else:
                    # Regular paragraph text
                    formatted_text = self._format_text_markup(paragraph)
                    story.append(Paragraph(formatted_text, self.body_style))
                    story.append(Spacer(1, 0.1*inch))
        
        story.append(PageBreak())

    def _format_text_markup(self, text: str) -> str:
        """Format text with bold markup for **text** patterns."""
        import re
        # Replace **text** with <b>text</b> for ReportLab bold formatting
        # Use non-greedy matching to handle multiple bold sections
        formatted_text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
        return formatted_text

    def _create_summary_statistics_table(self, story: List, stats: Dict):
        """Create summary statistics tables."""
        story.append(Paragraph("Assessment Summary", self.heading_style))
        story.append(Spacer(1, 0.2*inch))
        
        # Compliance Status Table
        if stats['compliance_status']:
            story.append(Paragraph("Compliance Status Distribution", self.subheading_style))
            
            compliance_data = [['Status', 'Count', 'Percentage']]
            total = stats['total_assessments']
            
            for status, count in stats['compliance_status'].items():
                percentage = f"{(count/total)*100:.1f}%" if total > 0 else "0%"
                compliance_data.append([status, str(count), percentage])
            
            compliance_table = Table(compliance_data, colWidths=[2.5*inch, 1*inch, 1*inch])
            compliance_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.darkgrey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 12),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 1), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.lightgrey])
            ]))
            
            # Add color coding for compliance status
            for i, (status, count) in enumerate(stats['compliance_status'].items(), 1):
                color = self.COMPLIANCE_COLORS.get(status, colors.grey)
                compliance_table.setStyle(TableStyle([
                    ('TEXTCOLOR', (0, i), (0, i), color),
                    ('FONTNAME', (0, i), (0, i), 'Helvetica-Bold')
                ]))
            
            story.append(compliance_table)
            story.append(Spacer(1, 0.3*inch))
        
        # Risk Level Table
        if stats['risk_levels']:
            story.append(Paragraph("Risk Level Distribution", self.subheading_style))
            
            risk_data = [['Risk Level', 'Count', 'Percentage']]
            total = stats['total_assessments']
            
            for risk, count in stats['risk_levels'].items():
                percentage = f"{(count/total)*100:.1f}%" if total > 0 else "0%"
                risk_data.append([risk, str(count), percentage])
            
            risk_table = Table(risk_data, colWidths=[2.5*inch, 1*inch, 1*inch])
            risk_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.darkgrey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 12),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 1), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.lightgrey])
            ]))
            
            # Add color coding for risk levels
            for i, (risk, count) in enumerate(stats['risk_levels'].items(), 1):
                color = self.RISK_COLORS.get(risk, colors.grey)
                risk_table.setStyle(TableStyle([
                    ('TEXTCOLOR', (0, i), (0, i), color),
                    ('FONTNAME', (0, i), (0, i), 'Helvetica-Bold')
                ]))
            
            story.append(risk_table)
        
        story.append(PageBreak())

    def _create_assessment_details(self, story: List, assessments: List[Dict]):
        """Create detailed assessment sections."""
        story.append(Paragraph("Detailed Assessment Results", self.heading_style))
        story.append(Spacer(1, 0.2*inch))
        
        for i, assessment in enumerate(assessments, 1):
            # Control statement
            control_statement = assessment.get('control_statement', 'No control statement provided')
            story.append(Paragraph(f"Assessment {i}: Control Statement", self.subheading_style))
            story.append(Paragraph(control_statement, self.body_style))
            story.append(Spacer(1, 0.1*inch))
            
            # Assessment result
            result = assessment.get('assessment_result', {})
            compliance_status = result.get('Compliance_Status', 'UNKNOWN')
            risk_level = result.get('Risk_Level', 'UNKNOWN')
            
            # Create status table
            status_data = [
                ['Compliance Status', compliance_status],
                ['Risk Level', risk_level]
            ]
            
            status_table = Table(status_data, colWidths=[2*inch, 2*inch])
            status_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 11),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8)
            ]))
            
            # Color code the status values
            compliance_color = self.COMPLIANCE_COLORS.get(compliance_status, colors.grey)
            risk_color = self.RISK_COLORS.get(risk_level, colors.grey)
            
            status_table.setStyle(TableStyle([
                ('TEXTCOLOR', (1, 0), (1, 0), compliance_color),
                ('TEXTCOLOR', (1, 1), (1, 1), risk_color)
            ]))
            
            story.append(status_table)
            story.append(Spacer(1, 0.1*inch))
            
            # Log evidence section
            log_evidence = assessment.get('log_evidence', {})
            if log_evidence:
                story.append(Paragraph("Log Evidence", self.subheading_style))
                
                # Source file
                source_file = log_evidence.get('Source_File', '')
                if source_file:
                    story.append(Paragraph(f"<b>Source File:</b> {source_file}", self.finding_style))
                    story.append(Spacer(1, 0.05*inch))
                
                # Relevant log entries
                log_entries = log_evidence.get('Relevant_Log_Entries', [])
                if log_entries:
                    story.append(Paragraph("<b>Relevant Log Entries:</b>", self.finding_style))
                    for entry in log_entries:
                        if self._has_meaningful_value(entry):
                            # Format log entries in a monospace-like style
                            log_style = ParagraphStyle(
                                'LogEntry',
                                parent=self.small_text_style,
                                fontName='Courier',
                                fontSize=8,
                                leftIndent=30,
                                backgroundColor=colors.lightgrey,
                                borderPadding=5
                            )
                            story.append(Paragraph(str(entry), log_style))
                            story.append(Spacer(1, 0.05*inch))
            
            # Assessment rationale
            rationale = assessment.get('assessment_rationale', {})
            if rationale:
                story.append(Paragraph("Assessment Rationale", self.subheading_style))
                
                for key, value in rationale.items():
                    if self._has_meaningful_value(value):
                        formatted_key = key.replace('_', ' ').title()
                        story.append(Paragraph(f"<b>{formatted_key}:</b>", self.finding_style))
                        story.append(Paragraph(str(value), self.small_text_style))
                        story.append(Spacer(1, 0.05*inch))
            
            # Improvement recommendations
            improvements = assessment.get('improvement_recommendation', {})
            if improvements:
                story.append(Paragraph("Improvement Recommendations", self.subheading_style))
                
                # Mandatory improvements
                mandatory = improvements.get('Mandatory_Improvements', [])
                if mandatory:
                    story.append(Paragraph("<b>Mandatory Improvements:</b>", self.finding_style))
                    for item in mandatory:
                        if self._has_meaningful_value(item):
                            story.append(Paragraph(f"• {str(item)}", self.small_text_style))
                            story.append(Spacer(1, 0.03*inch))
                    story.append(Spacer(1, 0.05*inch))
                
                # Enhancement opportunities
                enhancements = improvements.get('Enhancement_Opportunities', [])
                if enhancements:
                    story.append(Paragraph("<b>Enhancement Opportunities:</b>", self.finding_style))
                    for item in enhancements:
                        if self._has_meaningful_value(item):
                            story.append(Paragraph(f"• {str(item)}", self.small_text_style))
                            story.append(Spacer(1, 0.03*inch))
            
            story.append(Spacer(1, 0.2*inch))
            story.append(Paragraph("_" * 80, self.small_text_style))
            story.append(Spacer(1, 0.2*inch))

    def _create_header_footer(self, canvas, doc):
        """Create header and footer for each page."""
        canvas.saveState()
        
        # Header - adjust positioning to avoid overlap
        canvas.setFont('Helvetica-Bold', 10)
        canvas.setFillColor(colors.darkred)
        header_y = doc.height + doc.topMargin - 20  # Position within top margin
        canvas.drawString(doc.leftMargin, header_y, "Security Assessment Report")
        canvas.drawRightString(doc.width + doc.leftMargin, header_y, 
                             datetime.now().strftime('%Y-%m-%d'))
        
        # Add a line under the header
        canvas.setStrokeColor(colors.darkred)
        canvas.setLineWidth(0.5)
        canvas.line(doc.leftMargin, header_y - 5, doc.width + doc.leftMargin, header_y - 5)
        
        # Footer
        canvas.setFont('Helvetica', 9)
        canvas.setFillColor(colors.grey)
        footer_y = doc.bottomMargin - 20  # Position within bottom margin
        canvas.drawCentredString(doc.width/2 + doc.leftMargin, footer_y, f"Page {canvas.getPageNumber()}")
        
        canvas.restoreState()

    def _create_evidence_screenshot_section(self, story: List, evidence_screenshot):
        """Create evidence documentation screenshot section."""
        story.append(Paragraph("Evidence Documentation", self.heading_style))
        story.append(Spacer(1, 0.2*inch))
        
        try:
            # Convert PIL image to bytes for ReportLab
            img_buffer = io.BytesIO()
            
            # Ensure image is in RGB mode for PDF compatibility
            if evidence_screenshot.mode != 'RGB':
                evidence_screenshot = evidence_screenshot.convert('RGB')
            
            # Save image to buffer
            evidence_screenshot.save(img_buffer, format='JPEG', quality=85)
            img_buffer.seek(0)
            
            # Get image dimensions
            img_width, img_height = evidence_screenshot.size
            
            # Calculate scaling to fit within page margins
            page_width = letter[0] - 144  # Account for margins (72 points each side)
            page_height = letter[1] - 200  # Account for margins and header/footer space
            
            # Calculate scale factor to fit image on page
            width_scale = page_width / img_width
            height_scale = page_height / img_height
            scale_factor = min(width_scale, height_scale, 1.0)  # Don't scale up
            
            # Calculate final dimensions
            final_width = img_width * scale_factor
            final_height = img_height * scale_factor
            
            # Create ReportLab Image object
            rl_image = Image(img_buffer, width=final_width, height=final_height)
            
            # Add image description
            story.append(Paragraph("Supporting evidence documentation screenshot:", self.body_style))
            story.append(Spacer(1, 0.1*inch))
            
            # Add the image
            story.append(rl_image)
            story.append(Spacer(1, 0.2*inch))
            
            # Add image metadata
            metadata_text = f"Image dimensions: {img_width} x {img_height} pixels (scaled to {int(final_width)} x {int(final_height)} for display)"
            story.append(Paragraph(metadata_text, self.small_text_style))
            
        except Exception as e:
            # Fallback if image processing fails
            error_text = f"Error processing evidence screenshot: {str(e)}"
            story.append(Paragraph(error_text, self.body_style))
            story.append(Spacer(1, 0.1*inch))

    def generate_report(self, json_data: List[Dict], output_filename: str, evidence_docs_screenshot=None) -> Dict:
        """Generate the complete PDF report."""
        try:
            # Input validation
            if not isinstance(json_data, list):
                return {
                    'success': False,
                    'error': 'Input data must be a list of dictionaries',
                    'output_file': None
                }
            
            if not json_data:
                return {
                    'success': False,
                    'error': 'Input data cannot be empty',
                    'output_file': None
                }
            
            # Parse the data
            assessments, executive_summary, parsing_errors = self._parse_assessment_data(json_data)
            
            # Generate summary statistics
            stats = self._generate_summary_statistics(assessments)
            
            # Create PDF document
            doc = SimpleDocTemplate(
                output_filename,
                pagesize=letter,
                rightMargin=72,
                leftMargin=72,
                topMargin=100,
                bottomMargin=72
            )
            
            # Build story (content)
            story = []
            
            # Add title page
            self._create_title_page(story, stats)
            
            # Add executive summary if available
            if executive_summary:
                self._create_executive_summary(story, executive_summary)
            
            # Add summary statistics
            self._create_summary_statistics_table(story, stats)
            
            # Add detailed assessments
            if assessments:
                self._create_assessment_details(story, assessments)
            
            # Add evidence screenshot if provided
            if evidence_docs_screenshot:
                self._create_evidence_screenshot_section(story, evidence_docs_screenshot)
            
            # Build the PDF with header/footer callback
            doc.build(story, onFirstPage=self._create_header_footer, 
                     onLaterPages=self._create_header_footer)
            
            # Return detailed success result
            result = {
                'success': True,
                'output_file': output_filename,
                'total_assessments': len(assessments),
                'executive_summary_included': bool(executive_summary),
                'evidence_screenshot_included': bool(evidence_docs_screenshot),
                'file_size_bytes': os.path.getsize(output_filename) if os.path.exists(output_filename) else 0
            }
            
            if parsing_errors:
                result['parsing_errors'] = parsing_errors
                result['warnings'] = f"Generated with {len(parsing_errors)} parsing errors"
            
            return result
            
        except Exception as e:
            return {
                'success': False,
                'error': f"PDF generation failed: {str(e)}",
                'output_file': None
            }
