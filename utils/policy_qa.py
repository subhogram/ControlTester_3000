"""Policy Question Answering Module

Provides intelligent question answering about security policies including:
- Policy interpretation
- Requirement clarification
- Compliance guidance
- Best practice recommendations
"""

import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
from langchain_ollama import ChatOllama
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain, RetrievalQA
from langchain.memory import ConversationBufferWindowMemory

logger = logging.getLogger(__name__)

class PolicyQA:
    """Policy question answering system"""
    
    def __init__(self, model_name: str, kb_vectorstore=None, company_vectorstore=None):
        """Initialize policy QA system
        
        Args:
            model_name: LLM model to use
            kb_vectorstore: Knowledge base (policies) vector store
            company_vectorstore: Company documents vector store
        """
        self.model_name = model_name
        self.kb_vectorstore = kb_vectorstore
        self.company_vectorstore = company_vectorstore
        self.llm = ChatOllama(model=model_name, temperature=0.3)
        
        # Initialize memory for conversation context
        self.memory = ConversationBufferWindowMemory(
            k=5,
            return_messages=True,
            memory_key="chat_history"
        )
        
        logger.info(f"PolicyQA initialized with model: {model_name}")
    
    def answer_question(self, question: str, include_sources: bool = True) -> Dict[str, Any]:
        """Answer a question about security policies
        
        Args:
            question: User's question
            include_sources: Whether to include source documents
            
        Returns:
            Dictionary containing answer and metadata
        """
        logger.info(f"Answering policy question: {question[:100]}")
        
        # Determine question type
        question_type = self._classify_question(question)
        
        # Retrieve relevant context
        context = self._retrieve_context(question)
        
        # Generate answer based on question type
        if question_type == "policy_interpretation":
            answer = self._answer_interpretation_question(question, context)
        elif question_type == "compliance_guidance":
            answer = self._answer_compliance_question(question, context)
        elif question_type == "implementation":
            answer = self._answer_implementation_question(question, context)
        else:
            answer = self._answer_general_question(question, context)
        
        result = {
            "question": question,
            "answer": answer["answer"],
            "question_type": question_type,
            "confidence": answer.get("confidence", "medium"),
            "timestamp": datetime.now().isoformat()
        }
        
        if include_sources:
            result["sources"] = context.get("sources", [])
            result["relevant_policies"] = context.get("relevant_policies", [])
        
        # Store in memory
        self.memory.save_context(
            {"input": question},
            {"output": answer["answer"]}
        )
        
        return result
    
    def explain_policy(self, policy_name: str) -> Dict[str, Any]:
        """Provide detailed explanation of a policy
        
        Args:
            policy_name: Name or ID of policy
            
        Returns:
            Policy explanation
        """
        logger.info(f"Explaining policy: {policy_name}")
        
        # Retrieve policy content
        policy_context = self._retrieve_policy_content(policy_name)
        
        if not policy_context:
            return {
                "policy_name": policy_name,
                "error": "Policy not found",
                "explanation": "Unable to locate the specified policy in the knowledge base."
            }
        
        prompt = PromptTemplate(
            input_variables=["policy_name", "policy_content"],
            template="""Provide a comprehensive explanation of the following security policy:

Policy: {policy_name}

Policy Content:
{policy_content}

Provide:
1. Purpose and objectives
2. Key requirements
3. Scope and applicability
4. Implementation guidelines
5. Compliance considerations

Explanation:
"""
        )
        
        chain = LLMChain(llm=self.llm, prompt=prompt)
        
        try:
            explanation = chain.run(
                policy_name=policy_name,
                policy_content=policy_context
            )
            
            return {
                "policy_name": policy_name,
                "explanation": explanation,
                "source_content": policy_context[:500],
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Policy explanation failed: {e}")
            return {
                "policy_name": policy_name,
                "error": str(e),
                "explanation": "Unable to generate policy explanation."
            }
    
    def compare_policies(self, policy1: str, policy2: str) -> Dict[str, Any]:
        """Compare two policies
        
        Args:
            policy1: First policy name
            policy2: Second policy name
            
        Returns:
            Comparison analysis
        """
        logger.info(f"Comparing policies: {policy1} vs {policy2}")
        
        content1 = self._retrieve_policy_content(policy1)
        content2 = self._retrieve_policy_content(policy2)
        
        if not content1 or not content2:
            return {
                "error": "One or both policies not found"
            }
        
        prompt = PromptTemplate(
            input_variables=["policy1", "content1", "policy2", "content2"],
            template="""Compare these two security policies:

Policy 1: {policy1}
{content1}

Policy 2: {policy2}
{content2}

Provide:
1. Similarities
2. Differences
3. Complementary aspects
4. Potential conflicts or gaps
5. Recommendation for harmonization

Comparison:
"""
        )
        
        chain = LLMChain(llm=self.llm, prompt=prompt)
        
        try:
            comparison = chain.run(
                policy1=policy1,
                content1=content1[:1000],
                policy2=policy2,
                content2=content2[:1000]
            )
            
            return {
                "policy1": policy1,
                "policy2": policy2,
                "comparison": comparison,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Policy comparison failed: {e}")
            return {
                "error": str(e)
            }
    
    def get_compliance_requirements(self, framework: str) -> Dict[str, Any]:
        """Get compliance requirements for a framework
        
        Args:
            framework: Compliance framework (e.g., 'ISO 27001', 'NIST CSF')
            
        Returns:
            Compliance requirements
        """
        logger.info(f"Getting compliance requirements for: {framework}")
        
        query = f"compliance requirements for {framework}"
        context = self._retrieve_context(query)
        
        prompt = PromptTemplate(
            input_variables=["framework", "context"],
            template="""Explain the compliance requirements for {framework}:

Relevant Information:
{context}

Provide:
1. Overview of the framework
2. Key compliance requirements
3. Implementation steps
4. Common challenges
5. Best practices

Requirements:
"""
        )
        
        chain = LLMChain(llm=self.llm, prompt=prompt)
        
        try:
            requirements = chain.run(
                framework=framework,
                context=str(context)[:2000]
            )
            
            return {
                "framework": framework,
                "requirements": requirements,
                "sources": context.get("sources", []),
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Failed to get compliance requirements: {e}")
            return {
                "framework": framework,
                "error": str(e)
            }
    
    def _classify_question(self, question: str) -> str:
        """Classify the type of question"""
        question_lower = question.lower()
        
        if any(word in question_lower for word in ["what does", "define", "meaning", "explain"]):
            return "policy_interpretation"
        elif any(word in question_lower for word in ["compliant", "compliance", "requirement", "must"]):
            return "compliance_guidance"
        elif any(word in question_lower for word in ["how to", "implement", "setup", "configure"]):
            return "implementation"
        else:
            return "general"
    
    def _retrieve_context(self, question: str) -> Dict[str, Any]:
        """Retrieve relevant context for question"""
        context = {
            "policy_content": [],
            "company_content": [],
            "sources": [],
            "relevant_policies": []
        }
        
        # Search knowledge base
        if self.kb_vectorstore:
            try:
                kb_results = self.kb_vectorstore.similarity_search(question, k=4)
                context["policy_content"] = [doc.page_content for doc in kb_results]
                context["sources"].extend([{"type": "policy", "content": doc.page_content[:200]} 
                                          for doc in kb_results])
            except Exception as e:
                logger.warning(f"KB search failed: {e}")
        
        # Search company documents
        if self.company_vectorstore:
            try:
                company_results = self.company_vectorstore.similarity_search(question, k=3)
                context["company_content"] = [doc.page_content for doc in company_results]
                context["sources"].extend([{"type": "company", "content": doc.page_content[:200]} 
                                          for doc in company_results])
            except Exception as e:
                logger.warning(f"Company docs search failed: {e}")
        
        return context
    
    def _retrieve_policy_content(self, policy_name: str) -> Optional[str]:
        if not self.kb_vectorstore:
            return None
        
        try:
            results = self.kb_vectorstore.similarity_search(policy_name, k=1)
            if results:
                return results[0].page_content
        except Exception as e:
            logger.warning(f"Policy retrieval failed: {e}")
        
        return None
    
    def _answer_interpretation_question(self, question: str, context: Dict) -> Dict[str, Any]:
        """Answer policy interpretation question"""
        policy_content = "\n".join(context.get("policy_content", []))
        
        prompt = PromptTemplate(
            input_variables=["question", "policy_content"],
            template="""You are a cybersecurity policy expert. Answer the following question about security policies:

Question: {question}

Relevant Policy Information:
{policy_content}

Provide a clear, detailed interpretation focusing on:
1. The literal meaning
2. Practical implications
3. Common interpretations
4. Important considerations

Answer:
"""
        )
        
        chain = LLMChain(llm=self.llm, prompt=prompt)
        answer = chain.run(question=question, policy_content=policy_content[:2000])
        
        return {"answer": answer, "confidence": "high"}
    
    def _answer_compliance_question(self, question: str, context: Dict) -> Dict[str, Any]:
        """Answer compliance-related question"""
        all_content = "\n".join(
            context.get("policy_content", []) + context.get("company_content", [])
        )
        
        prompt = PromptTemplate(
            input_variables=["question", "content"],
            template="""You are a compliance expert. Answer this compliance question:

Question: {question}

Relevant Information:
{content}

Provide guidance on:
1. Compliance requirements
2. How to achieve compliance
3. Evidence needed
4. Common pitfalls to avoid

Answer:
"""
        )
        
        chain = LLMChain(llm=self.llm, prompt=prompt)
        answer = chain.run(question=question, content=all_content[:2000])
        
        return {"answer": answer, "confidence": "medium"}
    
    def _answer_implementation_question(self, question: str, context: Dict) -> Dict[str, Any]:
        """Answer implementation question"""
        all_content = "\n".join(
            context.get("policy_content", []) + context.get("company_content", [])
        )
        
        prompt = PromptTemplate(
            input_variables=["question", "content"],
            template="""You are a cybersecurity implementation specialist. Answer this implementation question:

Question: {question}

Relevant Information:
{content}

Provide practical guidance including:
1. Step-by-step implementation approach
2. Technical considerations
3. Tools and technologies
4. Best practices
5. Common challenges and solutions

Answer:
"""
        )
        
        chain = LLMChain(llm=self.llm, prompt=prompt)
        answer = chain.run(question=question, content=all_content[:2000])
        
        return {"answer": answer, "confidence": "medium"}
    
    def _answer_general_question(self, question: str, context: Dict) -> Dict[str, Any]:
        """Answer general question"""
        all_content = "\n".join(
            context.get("policy_content", []) + context.get("company_content", [])
        )
        
        prompt = PromptTemplate(
            input_variables=["question", "content"],
            template="""Answer the following question about cybersecurity policies:

Question: {question}

Relevant Information:
{content}

Provide a comprehensive answer based on the available information.

Answer:
"""
        )
        
        chain = LLMChain(llm=self.llm, prompt=prompt)
        answer = chain.run(question=question, content=all_content[:2000])
        
        return {"answer": answer, "confidence": "medium"}
