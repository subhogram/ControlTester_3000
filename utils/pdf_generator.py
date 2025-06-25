"""
Security Assessment PDF Report Generator Method

This module provides the generate_workbook method you requested for creating
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
    PageBreak, KeepTogether
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY


def generate_workbook(json_data, output_filename="security_assessment_report.pdf"):
    """
    Generate a visually pleasing PDF report from JSON security assessment data.
    
    Args:
        json_data: List of dictionaries containing assessment data in the format:
            [
                {
                    "assessment": "```json\n{...}\n```",
                    ...
                },
                {
                    "executive_summary": "Summary text..."
                }
            ]
        output_filename: Name of the output PDF file (default: "security_assessment_report.pdf")
        
    Returns:
        String: File path of generated PDF on success, None on failure
        
    Example:
        >>> data = [{"assessment": "...", ...}, {"executive_summary": "..."}]
        >>> pdf_path = generate_workbook(data, "my_report.pdf")
        >>> if pdf_path:
        >>>     print(f"Report generated: {pdf_path}")
        >>> else:
        >>>     print("Failed to generate report")
    """
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
        
        # Initialize generator
        generator = SecurityAssessmentReportGenerator()
        
        # Parse the data
        assessments, executive_summary, parsing_errors = generator._parse_assessment_data(json_data)
        
        # Generate summary statistics
        stats = generator._generate_summary_statistics(assessments)
        
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
        generator._create_title_page(story, stats)
        
        # Add executive summary if available
        if executive_summary:
            generator._create_executive_summary(story, executive_summary)
        
        # Add summary statistics
        generator._create_summary_statistics_table(story, stats)
        
        # Add detailed assessments
        if assessments:
            generator._create_assessment_details(story, assessments)
        
        # Build the PDF with header/footer callback
        doc.build(story, onFirstPage=generator._create_header_footer, 
                 onLaterPages=generator._create_header_footer)
        
        # Return file path on success
        if os.path.exists(output_filename):
            return output_filename
        else:
            return None
        
    except Exception as e:
        # Log error for debugging but return None for compatibility
        print(f"PDF generation failed: {str(e)}")
        return None


def generate_workbook_detailed(json_data, output_filename="security_assessment_report.pdf"):
    """
    Generate a PDF report and return detailed results including statistics and errors.
    
    Args:
        json_data: List of dictionaries containing assessment data
        output_filename: Name of the output PDF file
        
    Returns:
        Dictionary containing generation results, statistics, and any errors
    """
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
        
        # Initialize generator
        generator = SecurityAssessmentReportGenerator()
        
        # Parse the data
        assessments, executive_summary, parsing_errors = generator._parse_assessment_data(json_data)
        
        # Generate summary statistics
        stats = generator._generate_summary_statistics(assessments)
        
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
        generator._create_title_page(story, stats)
        
        # Add executive summary if available
        if executive_summary:
            generator._create_executive_summary(story, executive_summary)
        
        # Add summary statistics
        generator._create_summary_statistics_table(story, stats)
        
        # Add detailed assessments
        if assessments:
            generator._create_assessment_details(story, assessments)
        
        # Build the PDF with header/footer callback
        doc.build(story, onFirstPage=generator._create_header_footer, 
                 onLaterPages=generator._create_header_footer)
        
        # Return detailed success result
        result = {
            'success': True,
            'output_file': output_filename,
            'total_assessments': len(assessments),
            'executive_summary_included': bool(executive_summary),
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
        # Main title style - formal risk assessment theme
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
        
        # Section heading styles with better spacing
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
        
        # Executive summary style - risk-focused
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
        if isinstance(value, list) and all(not self._has_meaningful_value(item) for item in value):
            return False
        if isinstance(value, dict) and all(not self._has_meaningful_value(v) for v in value.values()):
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
                    cleaned_content = self._clean_json_content(item['assessment'])
                    
                    try:
                        assessment_data = json.loads(cleaned_content)
                        assessments.append(assessment_data)
                    except json.JSONDecodeError as e:
                        parsing_errors.append(f"Assessment {i+1}: Invalid JSON format - {str(e)}")
                        continue
                        
            except Exception as e:
                parsing_errors.append(f"Item {i+1}: Error processing data - {str(e)}")
        
        return assessments, executive_summary, parsing_errors

    def _generate_summary_statistics(self, assessments: List[Dict]) -> Dict[str, Any]:
        """Generate summary statistics for visual dashboard."""
        total_assessments = len(assessments)
        
        compliance_counts = {
            'COMPLIANT': 0,
            'NON-COMPLIANT': 0,
            'PARTIALLY COMPLIANT': 0,
            'NOT ASSESSED': 0
        }
        
        risk_counts = {
            'CRITICAL': 0,
            'HIGH': 0,
            'MEDIUM': 0,
            'LOW': 0
        }
        
        for assessment in assessments:
            result = assessment.get('ASSESSMENT RESULT', {})
            
            status = result.get('Compliance Status', 'NOT ASSESSED').upper()
            if status in compliance_counts:
                compliance_counts[status] += 1
            else:
                compliance_counts['NOT ASSESSED'] += 1
            
            risk = result.get('Risk Level', 'UNKNOWN').upper()
            if risk in risk_counts:
                risk_counts[risk] += 1
        
        return {
            'total_assessments': total_assessments,
            'compliance_counts': compliance_counts,
            'risk_counts': risk_counts
        }

    def _create_header_footer(self, canvas, doc):
        """Create professional risk assessment header and footer with proper spacing."""
        canvas.saveState()
        
        # Calculate proper header position to avoid overlap
        page_height = doc.pagesize[1]
        header_y = page_height - 50  # Position header 50 points from top
        
        # Header with risk assessment branding
        canvas.setFont('Helvetica-Bold', 9)
        canvas.setFillColor(colors.darkred)
        canvas.drawString(inch, header_y, "Risk Assessment & Control Testing Report")
        canvas.drawRightString(doc.width + inch, header_y, 
                              f"Assessment Date: {datetime.now().strftime('%Y-%m-%d')}")
        
        # Header line with proper spacing
        canvas.setStrokeColor(colors.darkred)
        canvas.setLineWidth(0.5)
        canvas.line(inch, header_y - 8, doc.width + inch, header_y - 8)
        
        # Footer with proper spacing from bottom
        footer_y = 40  # Position footer 40 points from bottom
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(colors.grey)
        canvas.drawString(inch, footer_y, "CONFIDENTIAL - Internal Risk Assessment")
        canvas.drawCentredString(doc.width / 2 + inch, footer_y, 
                              f"Page {canvas.getPageNumber()}")
        canvas.drawRightString(doc.width + inch, footer_y, "Risk & Control Framework")
        
        # Footer line
        canvas.setStrokeColor(colors.lightgrey)
        canvas.setLineWidth(0.5)
        canvas.line(inch, footer_y + 12, doc.width + inch, footer_y + 12)
        
        canvas.restoreState()

    def _create_title_page(self, story: List, stats: Dict[str, Any]):
        """Create a formal risk assessment title page with key risk metrics."""
        # Main title
        story.append(Paragraph("Risk Assessment &", self.title_style))
        story.append(Paragraph("Control Testing Report", self.subtitle_style))
        story.append(Spacer(1, 0.3 * inch))
        
        # Risk assessment metadata
        metadata = [
            ['Assessment Period:', datetime.now().strftime('%B %Y')],
            ['Report Date:', datetime.now().strftime('%B %d, %Y')],
            ['Total Controls Tested:', str(stats['total_assessments'])],
            ['Assessment Type:', 'Comprehensive Risk & Control Assessment'],
            ['Framework:', 'NIST Cybersecurity Framework / SOC 2'],
            ['Classification:', 'CONFIDENTIAL'],
            ['Document Version:', '1.0']
        ]
        
        metadata_table = Table(metadata, colWidths=[2.5*inch, 3.5*inch])
        metadata_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 1, colors.darkred),
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        
        story.append(metadata_table)
        story.append(Spacer(1, 0.4 * inch))
        
        # Risk summary dashboard
        critical_count = stats['risk_counts'].get('CRITICAL', 0)
        high_count = stats['risk_counts'].get('HIGH', 0)
        medium_count = stats['risk_counts'].get('MEDIUM', 0)
        low_count = stats['risk_counts'].get('LOW', 0)
        
        risk_summary = [
            ['RISK LEVEL SUMMARY', ''],
            ['Critical Risk Issues:', str(critical_count)],
            ['High Risk Issues:', str(high_count)],
            ['Medium Risk Issues:', str(medium_count)],
            ['Low Risk Issues:', str(low_count)]
        ]
        
        risk_table = Table(risk_summary, colWidths=[3*inch, 1.5*inch])
        risk_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 12),
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkred),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('BACKGROUND', (1, 1), (1, 1), colors.red if critical_count > 0 else colors.white),
            ('BACKGROUND', (1, 2), (1, 2), colors.orange if high_count > 0 else colors.white),
            ('BACKGROUND', (1, 3), (1, 3), colors.yellow if medium_count > 0 else colors.white),
            ('BACKGROUND', (1, 4), (1, 4), colors.green if low_count > 0 else colors.white),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
        ]))
        
        story.append(risk_table)
        story.append(PageBreak())

    def _create_executive_summary(self, story: List, executive_summary: str):
        """Create a risk-focused executive summary section."""
        if not executive_summary:
            return
            
        story.append(Paragraph("Executive Risk Summary", self.heading_style))
        story.append(Spacer(1, 12))
        
        # Add risk assessment context
        story.append(Paragraph("Risk Assessment Overview", self.subheading_style))
        story.append(Paragraph(
            "This report presents the findings of a comprehensive risk assessment and control testing "
            "engagement focused on identifying, evaluating, and documenting security risks within the "
            "organization's information systems and processes.",
            self.body_style
        ))
        story.append(Spacer(1, 10))
        
        # Format executive summary with proper paragraph breaks
        story.append(Paragraph("Key Findings & Risk Assessment", self.subheading_style))
        summary_paragraphs = executive_summary.split('\n\n')
        for para in summary_paragraphs:
            if para.strip():
                story.append(Paragraph(para.strip(), self.executive_style))
                story.append(Spacer(1, 6))
        
        story.append(PageBreak())

    def _create_summary_statistics_table(self, story: List, stats: Dict[str, Any]):
        """Create risk assessment summary with control effectiveness analysis."""
        story.append(Paragraph("Risk Assessment Summary", self.heading_style))
        story.append(Spacer(1, 12))
        
        # Control effectiveness overview
        story.append(Paragraph("Control Effectiveness Assessment", self.subheading_style))
        
        compliance_data = [['Control Status', 'Controls Tested', 'Percentage', 'Risk Impact']]
        total = stats['total_assessments']
        
        for status, count in stats['compliance_counts'].items():
            if count > 0:
                percentage = f"{(count/total)*100:.1f}%" if total > 0 else "0%"
                
                # Determine risk impact
                if status == 'NON-COMPLIANT':
                    risk_impact = 'High Risk'
                elif status == 'PARTIALLY COMPLIANT':
                    risk_impact = 'Medium Risk'
                elif status == 'COMPLIANT':
                    risk_impact = 'Low Risk'
                else:
                    risk_impact = 'Unknown'
                
                compliance_data.append([
                    status.replace('_', ' ').title(),
                    str(count),
                    percentage,
                    risk_impact
                ])
        
        compliance_table = Table(compliance_data, colWidths=[2*inch, 1*inch, 1*inch, 1.5*inch])
        compliance_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkred),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.lightgrey]),
        ]))
        
        story.append(compliance_table)
        story.append(Spacer(1, 20))
        
        # Risk level distribution with threat assessment
        story.append(Paragraph("Risk Level Distribution & Threat Analysis", self.subheading_style))
        
        risk_data = [['Risk Level', 'Issues Found', 'Percentage', 'Recommended Action']]
        
        for risk, count in stats['risk_counts'].items():
            if count > 0:
                percentage = f"{(count/total)*100:.1f}%" if total > 0 else "0%"
                
                # Recommended actions based on risk level
                if risk == 'CRITICAL':
                    action = 'Immediate Remediation Required'
                elif risk == 'HIGH':
                    action = 'Priority Remediation (30 days)'
                elif risk == 'MEDIUM':
                    action = 'Standard Remediation (90 days)'
                elif risk == 'LOW':
                    action = 'Monitor & Review'
                else:
                    action = 'Assessment Required'
                
                risk_data.append([risk.title(), str(count), percentage, action])
        
        risk_table = Table(risk_data, colWidths=[1.2*inch, 1*inch, 1*inch, 2.3*inch])
        risk_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkred),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.lightgrey]),
        ]))
        
        story.append(risk_table)
        story.append(PageBreak())

    def _create_assessment_details(self, story: List, assessments: List[Dict]):
        """Create detailed risk assessment findings and control testing results."""
        story.append(Paragraph("Risk Assessment Findings & Control Testing Results", self.heading_style))
        story.append(Spacer(1, 12))
        
        # Add methodology section
        story.append(Paragraph("Testing Methodology", self.subheading_style))
        story.append(Paragraph(
            "Each control was evaluated using a risk-based testing approach, assessing both design "
            "effectiveness and operational effectiveness. Testing procedures included examination of "
            "documentation, observation of processes, and analysis of system-generated evidence.",
            self.body_style
        ))
        story.append(Spacer(1, 15))
        
        for i, assessment in enumerate(assessments, 1):
            assessment_content = []
            
            # Main assessment heading with risk context
            assessment_content.append(
                Paragraph(f"Control Test #{i}", self.subheading_style)
            )
            assessment_content.append(Spacer(1, 8))
            
            # Iterate through all JSON keys and create sub-headers (only for keys with values)
            for key, value in assessment.items():
                # Skip empty or null values
                if not self._has_meaningful_value(value):
                    continue
                    
                # Create sub-header for each JSON key
                key_title = key.replace('_', ' ').title()
                assessment_content.append(
                    Paragraph(f"<b>{key_title}:</b>", self.body_style)
                )
                
                if key == 'CONTROL STATEMENT':
                    # Handle control statement with risk assessment context
                    if isinstance(value, list):
                        control_text = ' '.join(value)
                    else:
                        control_text = str(value)
                    
                    # Truncate very long statements for readability
                    if len(control_text) > 500:
                        control_text = control_text[:500] + "..."
                    
                    assessment_content.append(
                        Paragraph(f"<b>Control Objective:</b> {control_text}", self.body_style)
                    )
                    
                elif key == 'ASSESSMENT RESULT':
                    # Handle assessment result with risk-focused presentation
                    if isinstance(value, dict):
                        result_data = []
                        for sub_key, sub_value in value.items():
                            # Rename fields for risk assessment context
                            if 'compliance' in sub_key.lower():
                                display_key = 'Control Effectiveness'
                            elif 'risk' in sub_key.lower():
                                display_key = 'Risk Rating'
                            else:
                                display_key = sub_key
                            result_data.append([display_key, str(sub_value)])
                        
                        if result_data:
                            result_table = Table(result_data, colWidths=[2*inch, 3*inch])
                            
                            # Apply enhanced color coding for risk assessment
                            table_styles = [
                                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                                ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
                                ('FONTSIZE', (0, 0), (-1, -1), 11),
                                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                                ('TOPPADDING', (0, 0), (-1, -1), 8),
                            ]
                            
                            # Enhanced color coding for risk assessment
                            for row_idx, (sub_key, sub_value) in enumerate(value.items()):
                                if 'compliance' in sub_key.lower():
                                    color = self.COMPLIANCE_COLORS.get(str(sub_value).upper(), colors.grey)
                                    table_styles.extend([
                                        ('BACKGROUND', (1, row_idx), (1, row_idx), color),
                                        ('TEXTCOLOR', (1, row_idx), (1, row_idx), colors.white),
                                        ('FONTNAME', (1, row_idx), (1, row_idx), 'Helvetica-Bold'),
                                    ])
                                elif 'risk' in sub_key.lower():
                                    color = self.RISK_COLORS.get(str(sub_value).upper(), colors.grey)
                                    table_styles.extend([
                                        ('BACKGROUND', (1, row_idx), (1, row_idx), color),
                                        ('TEXTCOLOR', (1, row_idx), (1, row_idx), colors.white),
                                        ('FONTNAME', (1, row_idx), (1, row_idx), 'Helvetica-Bold'),
                                    ])
                            
                            result_table.setStyle(TableStyle(table_styles))
                            assessment_content.append(result_table)
                    
                elif key == 'LOG EVIDENCE':
                    # Handle log evidence as testing evidence
                    if isinstance(value, dict):
                        for log_key, log_value in value.items():
                            # Skip empty log values
                            if not self._has_meaningful_value(log_value):
                                continue
                                
                            # Enhanced evidence presentation
                            if 'source' in log_key.lower():
                                assessment_content.append(
                                    Paragraph(f"<b>Evidence Source:</b> {log_value}", self.finding_style)
                                )
                            elif 'log' in log_key.lower() or 'entries' in log_key.lower():
                                assessment_content.append(
                                    Paragraph("<b>Supporting Evidence:</b>", self.finding_style)
                                )
                                
                                if isinstance(log_value, list):
                                    # Only display non-empty log entries
                                    meaningful_entries = [entry for entry in log_value if self._has_meaningful_value(entry)]
                                    for entry in meaningful_entries[:3]:  # Limit to first 3 entries
                                        if len(str(entry)) > 180:
                                            entry = str(entry)[:180] + "..."
                                        assessment_content.append(
                                            Paragraph(f"• {entry}", self.small_text_style)
                                        )
                                    if len(meaningful_entries) > 3:
                                        assessment_content.append(
                                            Paragraph(f"... and {len(meaningful_entries) - 3} additional evidence items", self.small_text_style)
                                        )
                                else:
                                    assessment_content.append(
                                        Paragraph(str(log_value), self.small_text_style)
                                    )
                            else:
                                assessment_content.append(
                                    Paragraph(f"<i>{log_key}:</i> {str(log_value)}", self.small_text_style)
                                )
                else:
                    # Handle any other JSON keys
                    if isinstance(value, dict):
                        # If it's a dictionary, display key-value pairs (only non-empty ones)
                        for sub_key, sub_value in value.items():
                            if self._has_meaningful_value(sub_value):
                                assessment_content.append(
                                    Paragraph(f"<i>{sub_key}:</i> {str(sub_value)}", self.small_text_style)
                                )
                    elif isinstance(value, list):
                        # If it's a list, display as bullet points (only non-empty items)
                        meaningful_items = [item for item in value if self._has_meaningful_value(item)]
                        for item in meaningful_items:
                            assessment_content.append(
                                Paragraph(f"• {str(item)}", self.small_text_style)
                            )
                    else:
                        # Simple value
                        assessment_content.append(
                            Paragraph(str(value), self.body_style)
                        )
                
                # Add spacing after each sub-section
                assessment_content.append(Spacer(1, 8))
            
            # Add visual separator between assessments
            assessment_content.append(Spacer(1, 20))
            assessment_content.append(Paragraph("_" * 80, self.small_text_style))
            assessment_content.append(Spacer(1, 20))
            
            # Keep assessment content together on same page when possible
            story.append(KeepTogether(assessment_content))