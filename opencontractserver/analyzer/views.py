import json
import logging

from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from opencontractserver.analyzer.models import Analysis
from opencontractserver.tasks.analyzer_tasks import import_analysis
from opencontractserver.types.dicts import OpenContractsGeneratedCorpusPythonType
from opencontractserver.types.enums import JobStatus
from opencontractserver.utils.etl import is_dict_instance_of_typed_dict

logger = logging.getLogger(__name__)


class AnalysisCallbackView(APIView):

    authentication_classes = []  # no auth
    permission_classes = []  # no permissioning

    def post(self, request, analysis_id):

        logger.info(f"Handle callback for analysis_id: {analysis_id}")

        try:
            analysis = Analysis.objects.get(id=analysis_id)

        except Analysis.DoesNotExist:
            return Response(
                {
                    "message": "Provided analysis id does not map to an analysis. Are you sure it's correct?",
                    "analysis_id": f"{analysis_id}",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        callback_token = request.META.get("HTTP_CALLBACK_TOKEN")
        if callback_token is None:
            return Response(
                {
                    "message": "No CALLBACK_TOKEN provided in headers... Was this provided to the Gremlin Engine? "
                    "It's required to authenticate the callback to OpenContracts.",
                    "analysis_id": f"{analysis_id}",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        else:

            if analysis.callback_token.__str__() != callback_token:

                with transaction.atomic():
                    analysis.analysis_completed = timezone.now()
                    analysis.status = JobStatus.FAILED
                    analysis.save()

                return Response(
                    {
                        "message": f"CALLBACK_TOKEN provided but it does not match the token issued for analysis "
                        f"{analysis_id} . Did you provide the right token to the Gremlin Engine? "
                        f"Check your analysis_id too.",
                        "analysis_id": f"{analysis_id}",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            else:

                received_json = json.loads(request.body.decode("utf-8"))
                logger.info(f"Received json data from analysis {analysis_id}")

                if is_dict_instance_of_typed_dict(
                    received_json, OpenContractsGeneratedCorpusPythonType
                ):

                    with transaction.atomic():
                        analysis.received_callback_file.save(
                            f"analysis_{analysis.id}_results.json",
                            ContentFile(request.body),
                        )
                        analysis.analysis_completed = timezone.now()
                        analysis.status = JobStatus.COMPLETED
                        analysis.save()

                    # logger.info("Launch async import task!")
                    import_analysis.si(
                        creator_id=analysis.creator.id,
                        analysis_id=analysis.id,
                        analysis_results=received_json,
                    ).apply_async()

                else:

                    with transaction.atomic():
                        analysis.analysis_completed = timezone.now()
                        analysis.status = JobStatus.FAILED
                        analysis.save()

                    return Response(
                        {
                            "message": "Received data is not of the proper format.",
                            "analysis_id": f"{analysis_id}",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        return Response({"status": "OK", "analysis_id": analysis_id})
